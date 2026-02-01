// booking-system/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/utils/phone'
import { supabase } from '@/lib/db'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'
import { auth } from '@/auth'
import { sendAdminNotification, sendClientNotification, formatNewBookingNotification } from '@/lib/utils/telegram'
import { sendBookingCreatedEmail } from '@/lib/emails/email'
import { formatDateRu } from '@/lib/utils/date'

export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        const body = await request.json()

        const {
            booking_date,
            booking_time,
            client_name,
            client_phone,
            product_id,
            ...otherFields
        } = body

        if (!booking_date || !booking_time || !client_name || !client_phone || !product_id) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(String(booking_date))) {
            return NextResponse.json({ error: 'Invalid booking_date' }, { status: 400 })
        }

        const timeRegex = /^\d{2}:\d{2}$/
        if (!timeRegex.test(String(booking_time))) {
            return NextResponse.json({ error: 'Invalid booking_time' }, { status: 400 })
        }

        const normalizedName = String(client_name).trim()
        if (!normalizedName) {
            return NextResponse.json({ error: 'Invalid client_name' }, { status: 400 })
        }

        const normalizedPhone = normalizePhone(client_phone)
        const phone_hash = createHash('sha256').update(normalizedPhone).digest('hex')

        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, price_rub, is_active, name, description')
            .eq('id', Number(product_id))
            .maybeSingle()

        if (productError) {
            return NextResponse.json({ error: productError.message }, { status: 500 })
        }

        if (!product || !product.is_active) {
            return NextResponse.json({ error: 'Product not found' }, { status: 400 })
        }

        const amount = Number(product.price_rub)
        const productName = product?.name
        const productDescription = product?.description

        // Шаг 1: Проверка существования клиента
        let clientId: string | undefined = undefined
        let telegramChatId: string | null = null
        let existingClientId: string | undefined = undefined

        // Проверяем клиента по phone_hash
        const { data: existingClient, error: clientQueryError } = await supabase
            .from('clients')
            .select('id, telegram_chat_id')
            .eq('phone_hash', phone_hash)
            .maybeSingle()

        if (clientQueryError) {
            console.error('Error querying client:', clientQueryError)
        }

        if (existingClient) {
            // Клиент существует, используем его ID
            clientId = existingClient.id
            telegramChatId = existingClient.telegram_chat_id || null
            existingClientId = existingClient.id
        } else {
            // Шаг 2: Создание нового клиента
            const newClientData: any = {
                name: normalizedName,
                phone: normalizedPhone,
                phone_hash: phone_hash,
                email: otherFields.client_email || null,
                telegram: otherFields.client_telegram || null,
                role: 'client'
            }

            // Создаем нового клиента без явного указания ID - база сгенерирует автоматически
            const { data: newClient, error: createClientError } = await supabase
                .from('clients')
                .insert([newClientData])
                .select('id, telegram_chat_id')
                .single()

            if (createClientError) {
                // Если ошибка дублирования (клиент уже создался в другой сессии), находим его
                if (createClientError.code === '23505') {
                    const { data: duplicateClient } = await supabase
                        .from('clients')
                        .select('id, telegram_chat_id')
                        .eq('phone_hash', phone_hash)
                        .single()

                    if (duplicateClient) {
                        clientId = duplicateClient.id
                        telegramChatId = duplicateClient.telegram_chat_id || null
                        existingClientId = duplicateClient.id
                    } else {
                        console.error('Duplicate client error but client not found:', createClientError)
                        return NextResponse.json(
                            { error: 'Ошибка при создании клиента' },
                            { status: 500 }
                        )
                    }
                } else {
                    console.error('Error creating client:', createClientError)
                    return NextResponse.json(
                        { error: 'Ошибка при создании клиента' },
                        { status: 500 }
                    )
                }
            } else if (newClient) {
                // Успешно создали нового клиента
                clientId = newClient.id
                telegramChatId = newClient.telegram_chat_id || null
            }
        }

        // Шаг 3: Получение ID клиента для записи
        let finalClientId = clientId

        // Если администратор создает запись, и клиент существует, но не авторизован,
        // мы все равно используем существующий clientId
        if (session?.user?.role === 'admin' && existingClientId) {
            finalClientId = existingClientId
        }

        // Шаг 5: Создание записи
        const bookingData: any = {
            booking_date,
            booking_time,
            client_name: normalizedName,
            client_phone: normalizedPhone,
            phone_hash,
            product_id: Number(product_id),
            product_description: productDescription || null,
            amount,
            telegram_chat_id: telegramChatId,
            ...otherFields
        }

        // Добавляем client_id только если он определен
        if (finalClientId) {
            bookingData.client_id = finalClientId
        }

        // Также добавляем client_id из сессии, только если он реально существует
        if (session?.user?.role === 'client' && session.user.id) {
            let adminSupabase = supabase
            try {
                adminSupabase = createServiceRoleSupabaseClient()
            } catch (error) {
                console.warn('Service role недоступен, используем anon для проверки клиента')
            }

            const { data: sessionClient, error: sessionClientError } = await adminSupabase
                .from('clients')
                .select('id, phone_hash')
                .eq('id', session.user.id)
                .maybeSingle()

            if (sessionClientError) {
                console.warn('Не удалось проверить клиента по сессии:', sessionClientError)
            } else if (sessionClient?.id) {
                // Привязываем только если это тот же клиент по телефону
                if (sessionClient.phone_hash === phone_hash) {
                    bookingData.client_id = session.user.id
                }
            }
        }

        const { data, error } = await supabase
            .from('bookings')
            .insert([bookingData])
            .select()

        if (error) {
            console.error('Supabase error:', error)

            // Если ошибка дублирования записи
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'На это время уже есть запись' },
                    { status: 409 }
                )
            }

            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const newBooking = data[0];

        // Отправляем уведомление админу в Telegram
        await sendAdminNotification(
            formatNewBookingNotification({
                id: newBooking.id,
                client_name: normalizedName,
                client_phone: normalizedPhone,
                client_email: otherFields.client_email,
                booking_date,
                booking_time,
                product_name: productName,
                product_description: productDescription,
                amount,
            })
        );

        // Отправляем уведомление клиенту в Telegram (если подключен)
        if (telegramChatId) {
            const bookingDateFormatted = formatDateRu(booking_date);
            const clientMessage = `✅ <b>Запись создана!</b>\n\n📅 <b>Дата:</b> ${bookingDateFormatted}\n⏰ <b>Время:</b> ${booking_time}\n${productName ? `🎯 <b>Услуга:</b> ${productName}\n` : ''}${productDescription ? `📝 <b>Описание:</b> ${productDescription}\n` : ''}💰 <b>Сумма:</b> ${amount.toLocaleString('ru-RU')} ₽\n\n⏳ Ожидайте подтверждения записи.`;

            // URL личного кабинета
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
            const dashboardUrl = `${baseUrl}/dashboard`;
            
            console.log('📲 Отправка уведомления клиенту с кнопкой:', { chatId: telegramChatId, dashboardUrl });

            await sendClientNotification(telegramChatId, clientMessage, {
                dashboardUrl
            });
        }

        if (otherFields.client_email) {
            try {
                await sendBookingCreatedEmail({
                    to: otherFields.client_email,
                    userName: normalizedName,
                    bookingDate: booking_date,
                    bookingTime: booking_time,
                    productName: productName || 'Консультация',
                    productDescription: productDescription || undefined,
                    amount,
                })
            } catch (error) {
                console.error('Failed to send booking created email:', error)
            }
        }

        return NextResponse.json(newBooking, { status: 201 })
    } catch (error) {
        console.error('Ошибка при создании записи:', error)
        return NextResponse.json(
            { error: 'Не удалось создать запись' },
            { status: 500 }
        )
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const phone = searchParams.get('phone')
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '5')
        const status = searchParams.get('status')
        const clientId = searchParams.get('client_id')
        const sortBy = searchParams.get('sort_by') || 'created_at'
        const sortOrder = searchParams.get('sort_order') || 'desc'

        const offset = (page - 1) * limit

        // Автоматически обновляем статусы прошедших записей
        const now = new Date()
        const { data: pastBookings } = await supabase
            .from('bookings')
            .select('id, booking_date, booking_time, status')
            .in('status', ['confirmed', 'pending_payment'])

        if (pastBookings && pastBookings.length > 0) {
            const bookingsToComplete: number[] = []
            const bookingsToCancel: number[] = []

            pastBookings.forEach((booking) => {
                try {
                    const bookingDateTime = new Date(`${booking.booking_date}T${booking.booking_time}:00+03:00`)
                    if (bookingDateTime < now) {
                        if (booking.status === 'confirmed') {
                            // Оплаченные записи -> completed
                            bookingsToComplete.push(booking.id)
                        } else if (booking.status === 'pending_payment') {
                            // Неоплаченные записи -> cancelled
                            bookingsToCancel.push(booking.id)
                        }
                    }
                } catch {
                    // Игнорируем ошибки парсинга даты
                }
            })

            // Обновляем статусы
            if (bookingsToComplete.length > 0) {
                await supabase
                    .from('bookings')
                    .update({ status: 'completed', updated_at: now.toISOString() })
                    .in('id', bookingsToComplete)
            }

            if (bookingsToCancel.length > 0) {
                await supabase
                    .from('bookings')
                    .update({ status: 'cancelled', updated_at: now.toISOString() })
                    .in('id', bookingsToCancel)
            }
        }

        let query = supabase
            .from('bookings')
            .select(`
                *,
                products(name, price_rub),
                clients(name, email, phone)
            `, { count: 'exact' })

        // Применяем фильтры
        if (phone) {
            const normalizedPhone = normalizePhone(phone)
            query = query.eq('client_phone', normalizedPhone)
        }

        if (status) {
            query = query.eq('status', status)
        }

        if (clientId) {
            query = query.eq('client_id', clientId)
        }

        // Применяем сортировку
        query = query.order(sortBy, { ascending: sortOrder === 'asc' })

        // Применяем пагинацию
        query = query.range(offset, offset + limit - 1)

        const { data, error, count } = await query

        if (error) {
            console.error('Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const totalCount = count || 0
        const hasMore = offset + limit < totalCount

        return NextResponse.json({
            data: data || [],
            pagination: {
                page,
                limit,
                totalCount,
                hasMore,
                totalPages: Math.ceil(totalCount / limit)
            }
        })
    } catch (error) {
        console.error('Ошибка при получении записей:', error)
        return NextResponse.json(
            { error: 'Не удалось получить записи' },
            { status: 500 }
        )
    }
}