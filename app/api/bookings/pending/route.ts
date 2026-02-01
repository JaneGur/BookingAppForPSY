import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { normalizePhone } from '@/lib/utils/phone'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const phone = searchParams.get('phone')

        if (!phone) {
            return NextResponse.json({ error: 'phone is required' }, { status: 400 })
        }

        const normalizedPhone = normalizePhone(phone)
        const now = new Date()

        const { data: allPending, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('client_phone', normalizedPhone)
            .eq('status', 'pending_payment')
            .order('booking_date', { ascending: true })
            .order('booking_time', { ascending: true })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!allPending || allPending.length === 0) {
            return NextResponse.json(null)
        }

        // Проверяем и отменяем прошедшие неоплаченные записи
        const bookingsToCancel: number[] = []
        let activePending = null

        for (const booking of allPending) {
            try {
                const bookingDateTime = new Date(`${booking.booking_date}T${booking.booking_time}:00+03:00`)
                
                if (bookingDateTime < now) {
                    // Прошедшая неоплаченная запись -> отменяем
                    bookingsToCancel.push(booking.id)
                } else if (!activePending) {
                    // Первая активная запись
                    activePending = booking
                }
            } catch {
                // Игнорируем ошибки парсинга
            }
        }

        // Отменяем прошедшие записи в фоне
        if (bookingsToCancel.length > 0) {
            supabase
                .from('bookings')
                .update({ status: 'cancelled', updated_at: now.toISOString() })
                .in('id', bookingsToCancel)
                .then(() => {})
        }

        return NextResponse.json(activePending)
    } catch (e) {
        console.error('Pending booking error:', e)
        return NextResponse.json({ error: 'Не удалось получить заказ' }, { status: 500 })
    }
}
