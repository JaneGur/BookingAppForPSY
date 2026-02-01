import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

/**
 * Утилитный endpoint для принудительного обновления статусов прошедших записей
 * Можно вызвать вручную или автоматически при загрузке страницы
 */
export async function POST(request: NextRequest) {
    try {
        const now = new Date()
        
        // Получаем все записи со статусом confirmed или pending_payment
        const { data: pastBookings, error: fetchError } = await supabase
            .from('bookings')
            .select('id, booking_date, booking_time, status')
            .in('status', ['confirmed', 'pending_payment'])

        if (fetchError) {
            console.error('Error fetching bookings:', fetchError)
            return NextResponse.json({ error: fetchError.message }, { status: 500 })
        }

        if (!pastBookings || pastBookings.length === 0) {
            return NextResponse.json({ 
                success: true, 
                message: 'No bookings to update',
                updated: 0,
                cancelled: 0
            })
        }

        const bookingsToComplete: number[] = []
        const bookingsToCancel: number[] = []

        // Проверяем каждую запись
        pastBookings.forEach((booking) => {
            try {
                const bookingDateTime = new Date(`${booking.booking_date}T${booking.booking_time}:00+03:00`)
                
                if (bookingDateTime < now) {
                    if (booking.status === 'confirmed') {
                        // Оплаченные прошедшие записи -> completed
                        bookingsToComplete.push(booking.id)
                    } else if (booking.status === 'pending_payment') {
                        // Неоплаченные прошедшие записи -> cancelled
                        bookingsToCancel.push(booking.id)
                    }
                }
            } catch (error) {
                console.error(`Error parsing date for booking ${booking.id}:`, error)
            }
        })

        // Обновляем статусы
        let completedCount = 0
        let cancelledCount = 0

        if (bookingsToComplete.length > 0) {
            const { error: updateError } = await supabase
                .from('bookings')
                .update({ status: 'completed', updated_at: now.toISOString() })
                .in('id', bookingsToComplete)

            if (updateError) {
                console.error('Error updating completed bookings:', updateError)
            } else {
                completedCount = bookingsToComplete.length
                console.log(`✅ Updated ${completedCount} bookings to completed`)
            }
        }

        if (bookingsToCancel.length > 0) {
            const { error: updateError } = await supabase
                .from('bookings')
                .update({ status: 'cancelled', updated_at: now.toISOString() })
                .in('id', bookingsToCancel)

            if (updateError) {
                console.error('Error updating cancelled bookings:', updateError)
            } else {
                cancelledCount = bookingsToCancel.length
                console.log(`✅ Updated ${cancelledCount} bookings to cancelled`)
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Statuses updated successfully',
            completed: completedCount,
            cancelled: cancelledCount,
            total: completedCount + cancelledCount
        })
    } catch (error) {
        console.error('Error updating booking statuses:', error)
        return NextResponse.json(
            { error: 'Failed to update statuses', message: String(error) },
            { status: 500 }
        )
    }
}

// Также доступен через GET для удобства
export async function GET(request: NextRequest) {
    return POST(request)
}
