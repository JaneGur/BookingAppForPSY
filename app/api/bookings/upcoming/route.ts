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
        const today = new Date().toISOString().slice(0, 10)

        const now = new Date()

        // Получаем все записи со статусом confirmed или pending_payment начиная с сегодня
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('client_phone', normalizedPhone)
            .in('status', ['confirmed', 'pending_payment'])
            .gte('booking_date', today)
            .order('booking_date', { ascending: true })
            .order('booking_time', { ascending: true })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Обновляем статусы прошедших записей
        const bookingsToComplete: number[] = []
        const bookingsToCancel: number[] = []

        const upcomingBookings = (data || []).filter((booking) => {
            try {
                const bookingDateTime = new Date(`${booking.booking_date}T${booking.booking_time}:00+03:00`)
                
                if (bookingDateTime < now) {
                    // Запись прошла - нужно обновить статус
                    if (booking.status === 'confirmed') {
                        bookingsToComplete.push(booking.id)
                    } else if (booking.status === 'pending_payment') {
                        bookingsToCancel.push(booking.id)
                    }
                    return false
                }
                
                return true
            } catch {
                return false
            }
        })

        // Обновляем статусы в фоне
        if (bookingsToComplete.length > 0) {
            supabase
                .from('bookings')
                .update({ status: 'completed', updated_at: now.toISOString() })
                .in('id', bookingsToComplete)
                .then(() => {})
        }

        if (bookingsToCancel.length > 0) {
            supabase
                .from('bookings')
                .update({ status: 'cancelled', updated_at: now.toISOString() })
                .in('id', bookingsToCancel)
                .then(() => {})
        }

        // Возвращаем первую (ближайшую) запись или null
        return NextResponse.json(upcomingBookings[0] ?? null)
    } catch (e) {
        console.error('Upcoming booking error:', e)
        return NextResponse.json({ error: 'Не удалось получить ближайшую запись' }, { status: 500 })
    }
}
