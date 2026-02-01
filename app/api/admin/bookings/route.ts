import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { auth } from '@/auth'

export async function GET(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')
        const search = searchParams.get('search')
        const startDate = searchParams.get('start_date')
        const endDate = searchParams.get('end_date')
        const clientId = searchParams.get('client_id')
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '5')
        const sortBy = searchParams.get('sort_by') || 'booking_date'
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
                            bookingsToComplete.push(booking.id)
                        } else if (booking.status === 'pending_payment') {
                            bookingsToCancel.push(booking.id)
                        }
                    }
                } catch {
                    // Игнорируем ошибки парсинга даты
                }
            })

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

        // Создаем базовый запрос с JOIN к таблице клиентов
        let query = supabase
            .from('bookings')
            .select(`
                *,
                client:clients (
                    id,
                    name,
                    phone,
                    email,
                    telegram,
                    telegram_chat_id,
                    created_at,
                    updated_at
                ),
                products(name, price_rub)
            `, { count: 'exact' })

        // Фильтр по статусу
        if (status) {
            const statuses = status.split(',')
            if (statuses.length === 1) {
                query = query.eq('status', statuses[0])
            } else {
                query = query.in('status', statuses)
            }
        }

        // Фильтр по дате
        if (startDate) {
            query = query.gte('booking_date', startDate)
        }
        if (endDate) {
            query = query.lte('booking_date', endDate)
        }

        // Фильтр по client_id
        if (clientId) {
            query = query.eq('client_id', clientId)
        }

        // Применяем сортировку
        if (sortBy === 'booking_date') {
            query = query.order('booking_date', { ascending: sortOrder === 'asc' })
                .order('booking_time', { ascending: sortOrder === 'asc' })
        } else {
            query = query.order(sortBy, { ascending: sortOrder === 'asc' })
                .order('booking_date', { ascending: false })
                .order('booking_time', { ascending: false })
        }

        // Поиск на сервере по данным бронирования
        if (search) {
            const searchPattern = `%${search}%`
            query = query.or(
                `client_name.ilike.${searchPattern},client_phone.ilike.${searchPattern},client_email.ilike.${searchPattern}`
            )
        }

        // Применяем пагинацию
        query = query.range(offset, offset + limit - 1)

        const { data, error, count } = await query

        if (error) {
            console.error('Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const resultData = data ?? []
        const totalCount = count || 0
        const hasMore = resultData.length === limit && offset + limit < totalCount

        return NextResponse.json({
            data: resultData,
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