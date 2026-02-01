'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { format, parseISO, startOfDay, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
    Calendar,
    Search,
    Filter,
    Plus,
    CheckCircle,
    XCircle,
    Trash2,
    Edit,
    Eye,
    Clock,
    ArrowUpDown,
    CheckSquare,
    Square,
    List,
    CalendarDays,
    Ban,
    User,
    ChevronDown,
    ChevronUp,
    MoreVertical,
    X
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Booking } from '@/types/booking'
import { cn } from '@/lib/utils/cn'
import { BookingsCalendar } from './BookingsCalendar'
import { BookingDetailsModal } from './BookingDetailsModal'
import { useUpdateBookingStatus, useDeleteBooking, useCancelBooking } from '@/lib/hooks'
import { RescheduleBookingModal } from '@/components/admin/RescheduleBookingModal'
import { toast } from 'sonner'
import { LoadMoreButton } from '@/components/ui/LoadMoreButton'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'


interface BookingsTabProps {
    onCreateBooking: () => void
    refreshTrigger?: number
}

type ViewMode = 'list' | 'calendar'
type SortField = 'date' | 'created_at' | 'status' | 'amount' | 'client_name'
type SortDirection = 'asc' | 'desc'
type QuickFilter = 'all' | 'today' | 'week' | 'month' | 'upcoming' | 'past'

const BOOKINGS_PER_PAGE = 10

function StatusBadge({ status }: { status: Booking['status'] }) {
    const base = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs font-bold shadow-md transition-all duration-300 hover:scale-105'
    const map: Record<Booking['status'], { label: string; className: string; icon: string }> = {
        pending_payment: { label: 'Ожидает оплаты', className: 'bg-gradient-to-br from-yellow-100 to-yellow-200 text-yellow-800 border-2 border-yellow-300', icon: '⏳' },
        confirmed: { label: 'Подтверждена', className: 'bg-gradient-to-br from-green-100 to-green-200 text-green-800 border-2 border-green-300', icon: '✓' },
        completed: { label: 'Завершена', className: 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-800 border-2 border-emerald-300', icon: '✓' },
        cancelled: { label: 'Отменена', className: 'bg-gradient-to-br from-red-100 to-red-200 text-red-800 border-2 border-red-300', icon: '✕' },
    }
    const item = map[status]
    return (
        <span className={cn(base, item.className)}>
            <span className="text-base">{item.icon}</span>
            <span className="hidden sm:inline">{item.label}</span>
        </span>
    )
}

export function BookingsTab({ onCreateBooking, refreshTrigger }: BookingsTabProps) {
    // 🚀 Optimistic updates hooks
    const updateStatus = useUpdateBookingStatus()
    const deleteBooking = useDeleteBooking()
    const cancelBooking = useCancelBooking()
    const queryClient = useQueryClient()

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({})
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
    const [viewMode, setViewMode] = useState<ViewMode>('list')
    const [selectedBookings, setSelectedBookings] = useState<Set<number>>(new Set())
    const [sortField, setSortField] = useState<SortField>('date')
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
    const [bookingDetails, setBookingDetails] = useState<Booking | null>(null)
    const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null)
    const [showFilters, setShowFilters] = useState(false)
    const [calendarDate, setCalendarDate] = useState(new Date())
    const [selectedDayBookings, setSelectedDayBookings] = useState<Booking[]>([])
    const [detailsBooking, setDetailsBooking] = useState<Booking | null>(null)

    // Мобильные состояния для сворачивания блоков
    const [showStats, setShowStats] = useState(false)
    const [showSearch, setShowSearch] = useState(false)

    // Кнопка "Показать еще" для заказов
    const currentPageRef = useRef(1)
    const [bookings, setBookings] = useState<Booking[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [fullStats, setFullStats] = useState<any>(null) // Полная статистика по всем данным

    const loadBookings = async (page: number = 1, append: boolean = false) => {
        if (append) {
            setIsLoadingMore(true)
        } else {
            setIsLoading(true)
        }
        try {
            // Обновляем статусы прошедших записей перед загрузкой
            if (page === 1 && !append) {
                fetch('/api/bookings/update-statuses', { method: 'POST' }).catch(() => {})
            }
            
            const params = new URLSearchParams({
                page: page.toString(),
                limit: BOOKINGS_PER_PAGE.toString(),
                sort_by: sortField === 'date' ? 'booking_date' : sortField,
                sort_order: sortDirection
            })

            if (selectedStatuses.length > 0) {
                params.append('status', selectedStatuses.join(','))
            }
            if (dateRange.start) {
                params.append('start_date', dateRange.start)
            }
            if (dateRange.end) {
                params.append('end_date', dateRange.end)
            }
            if (searchQuery) {
                params.append('search', searchQuery)
            }

            const res = await fetch(`/api/admin/bookings?${params.toString()}`)
            if (!res.ok) throw new Error('Failed to load bookings')
            const result = await res.json()

            const adminBookings = result.data || []
            const normalized = adminBookings.map((adminBooking: any) => ({
                ...adminBooking,
                phone_hash: '' // Добавляем пустое значение для совместимости
            }))
            if (append) {
                setBookings((prev) => {
                    const existingIds = new Set(prev.map((b) => b.id))
                    const uniqueNew = normalized.filter((b: Booking) => !existingIds.has(b.id))
                    return [...prev, ...uniqueNew]
                })
            } else {
                setBookings(normalized)
            }
            setHasMore(result.pagination?.hasMore || false)
            currentPageRef.current = page
        } catch (error) {
            console.error('Error loading bookings:', error)
        } finally {
            setIsLoading(false)
            setIsLoadingMore(false)
        }
    }

    const loadMore = () => {
        if (hasMore && !isLoading && !isLoadingMore) {
            loadBookings(currentPageRef.current + 1, true)
        }
    }

    // Загрузка полной статистики по всем данным
    const loadFullStats = async () => {
        try {
            const params = new URLSearchParams({
                limit: '10000', // Большой лимит для получения всех данных
                sort_by: 'booking_date',
                sort_order: 'desc'
            })

            if (selectedStatuses.length > 0) {
                params.append('status', selectedStatuses.join(','))
            }
            if (dateRange.start) {
                params.append('start_date', dateRange.start)
            }
            if (dateRange.end) {
                params.append('end_date', dateRange.end)
            }
            if (searchQuery) {
                params.append('search', searchQuery)
            }

            const res = await fetch(`/api/admin/bookings?${params.toString()}`)
            if (!res.ok) throw new Error('Failed to load full stats')
            const result = await res.json()

            const allBookings = result.data || []

            // Считаем статистику по всем данным
            const stats = {
                total: allBookings.length,
                pending: allBookings.filter((b: any) => b.status === 'pending_payment').length,
                confirmed: allBookings.filter((b: any) => b.status === 'confirmed').length,
                completed: allBookings.filter((b: any) => b.status === 'completed').length,
                cancelled: allBookings.filter((b: any) => b.status === 'cancelled').length,
            }

            setFullStats(stats)
        } catch (error) {
            console.error('Error loading full stats:', error)
        }
    }

    // Загружаем первую страницу при монтировании
    useEffect(() => {
        currentPageRef.current = 1
        loadBookings(1, false)
        loadFullStats() // Загружаем полную статистику при монтировании
    }, [])

    useEffect(() => {
        const today = startOfDay(new Date())
        if (quickFilter === 'all') {
            setDateRange({})
            return
        }

        if (quickFilter === 'today') {
            const day = format(today, 'yyyy-MM-dd')
            setDateRange({ start: day, end: day })
            return
        }

        if (quickFilter === 'week') {
            const start = startOfWeek(today, { weekStartsOn: 1 })
            const end = endOfWeek(today, { weekStartsOn: 1 })
            setDateRange({
                start: format(start, 'yyyy-MM-dd'),
                end: format(end, 'yyyy-MM-dd'),
            })
            return
        }

        if (quickFilter === 'month') {
            const start = startOfMonth(today)
            const end = endOfMonth(today)
            setDateRange({
                start: format(start, 'yyyy-MM-dd'),
                end: format(end, 'yyyy-MM-dd'),
            })
            return
        }

        if (quickFilter === 'upcoming') {
            const start = format(today, 'yyyy-MM-dd')
            const end = format(addDays(today, 30), 'yyyy-MM-dd')
            setDateRange({ start, end })
            return
        }

        if (quickFilter === 'past') {
            const end = format(addDays(today, -1), 'yyyy-MM-dd')
            setDateRange({ end })
        }
    }, [quickFilter])

    // Применяем фильтры и сортировки
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            currentPageRef.current = 1
            loadBookings(1, false)
            loadFullStats() // Загружаем полную статистику при изменении фильтров
        }, 300) // Debounce 300ms

        return () => clearTimeout(timeoutId)
    }, [selectedStatuses.join(','), dateRange.start, dateRange.end, searchQuery, sortField, sortDirection])

    // Группируем записи по датам
    const groupedBookings = useMemo(() => {
        const groups = new Map<string, Booking[]>()
        bookings.forEach((booking) => {
            const dateKey = booking.booking_date
            if (!groups.has(dateKey)) {
                groups.set(dateKey, [])
            }
            groups.get(dateKey)!.push(booking)
        })

        const compareByField = (a: Booking, b: Booking) => {
            let value = 0
            switch (sortField) {
                case 'created_at':
                    value = Date.parse(a.created_at) - Date.parse(b.created_at)
                    break
                case 'status':
                    value = a.status.localeCompare(b.status)
                    break
                case 'amount':
                    value = (a.amount || 0) - (b.amount || 0)
                    break
                case 'client_name':
                    value = a.client_name.localeCompare(b.client_name)
                    break
                default:
                    value = 0
            }
            return sortDirection === 'desc' ? -value : value
        }

        const entries = Array.from(groups.entries())

        if (sortField === 'date') {
            entries.sort((a, b) =>
                sortDirection === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])
            )
            entries.forEach(([, list]) => {
                list.sort((a, b) => a.booking_time.localeCompare(b.booking_time))
            })
        } else {
            entries.forEach(([, list]) => {
                list.sort(compareByField)
            })
        }

        return entries
    }, [bookings, sortField, sortDirection])

    // Статистика
    const stats = useMemo(() => {
        return {
            total: fullStats?.total || 0, // Общее количество из полной статистики
            pending: fullStats?.pending || 0, // Из полной статистики
            confirmed: fullStats?.confirmed || 0, // Из полной статистики
            completed: fullStats?.completed || 0, // Из полной статистики
            cancelled: fullStats?.cancelled || 0, // Из полной статистики
        }
    }, [fullStats])

    const handleStatusToggle = (status: string) => {
        setSelectedStatuses((prev) =>
            prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
        )
    }

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDirection('asc')
        }
    }

    const handleSelectAll = () => {
        if (selectedBookings.size === bookings.length) {
            setSelectedBookings(new Set())
        } else {
            setSelectedBookings(new Set(bookings.map(b => b.id)))
        }
    }

    const handleSelectBooking = (id: number) => {
        const newSelected = new Set(selectedBookings)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedBookings(newSelected)
    }

    const handleBulkStatusChange = async (newStatus: Booking['status']) => {
        if (selectedBookings.size === 0) return

        const actionName = newStatus === 'confirmed' ? 'подтвердить' :
            newStatus === 'completed' ? 'завершить' : 'отменить'

        if (!confirm(`${newStatus === 'cancelled' ? 'Отменить' : 'Изменить статус у'} ${selectedBookings.size} записей?`)) return

        try {
            const promises = Array.from(selectedBookings).map(id =>
                fetch(`/api/bookings/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                })
            )

            await Promise.all(promises)

            // Инвалидируем кэш React Query
            queryClient.invalidateQueries({ queryKey: ['bookings'] })

            setSelectedBookings(new Set())
            toast.success(`Статус ${selectedBookings.size} записей изменен`)
        } catch (error) {
            console.error('Failed to bulk update:', error)
            toast.error('Не удалось изменить статус')
        }
    }

    const handleBulkCancel = async () => {
        if (selectedBookings.size === 0) return
        if (!confirm(`Отменить ${selectedBookings.size} записей? Записи будут помечены как отмененные, но останутся в истории.`)) return

        try {
            // Используем мутации для оптимистичной отмены
            const cancelPromises = Array.from(selectedBookings).map(id =>
                cancelBooking.mutateAsync(id)
            )

            await Promise.all(cancelPromises)

            setSelectedBookings(new Set())
            toast.success(`Отменено ${selectedBookings.size} записей`)
        } catch (error) {
            console.error('Failed to bulk cancel:', error)
            toast.error('Не удалось отменить записи')
        }
    }

    const handleBulkDelete = async () => {
        if (selectedBookings.size === 0) return
        if (!confirm(`Полностью удалить ${selectedBookings.size} записей из базы данных? Это действие необратимо. Записи будут удалены безвозвратно.`)) return

        try {
            // Используем мутации для оптимистичного удаления
            const deletePromises = Array.from(selectedBookings).map(id =>
                deleteBooking.mutateAsync(id)
            )

            await Promise.all(deletePromises)

            setSelectedBookings(new Set())
            toast.success(`Удалено ${selectedBookings.size} записей`)
        } catch (error) {
            console.error('Failed to bulk delete:', error)
            toast.error('Не удалось удалить записи')
        }
    }

    const handleMarkPaid = async (id: number) => {
        try {
            await updateStatus.mutateAsync({
                id,
                status: 'confirmed',
                paid_at: new Date().toISOString()
            })
            toast.success('Запись подтверждена и оплачена')
        } catch (error) {
            console.error('Failed to mark as paid:', error)
            toast.error('Не удалось подтвердить оплату')
        }
    }

    const handleCancel = async (id: number) => {
        if (!confirm('Отменить эту запись? Запись будет помечена как отмененная, но останется в истории.')) return
        try {
            await cancelBooking.mutateAsync(id)
            toast.success('Запись отменена')
        } catch (error) {
            console.error('Failed to cancel:', error)
            toast.error('Не удалось отменить запись')
        }
    }

    const handleRescheduleOpen = (booking: Booking) => {
        setRescheduleBooking(booking)
    }

    // 🎯 OPTIMISTIC UPDATE - полное удаление записи
    const handleDelete = async (id: number) => {
        if (!confirm('Полностью удалить эту запись из базы данных? Это действие необратимо. Запись будет удалена безвозвратно.')) return
        try {
            await deleteBooking.mutateAsync(id)
            toast.success('Запись полностью удалена')
        } catch (error) {
            console.error('Failed to delete:', error)
            toast.error('Не удалось удалить запись')
        }
    }

    const handleDayClick = (date: string, dayBookings: Booking[]) => {
        setSelectedDayBookings(dayBookings)
    }

    // 🎯 OPTIMISTIC UPDATE - изменение статуса записи
    const handleStatusChange = async (id: number, status: Booking['status']) => {
        try {
            await updateStatus.mutateAsync({ id, status })
            toast.success('Статус записи изменен')
        } catch (error) {
            console.error('Failed to change status:', error)
            toast.error('Не удалось изменить статус')
        }
    }

    return (
        <div className="space-y-3 sm:space-y-8">

            {/* Заголовок */}
            <Card className="booking-card border-2">
                <CardContent className="p-3 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg flex-shrink-0">
                                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">Управление записями</h2>
                                <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 truncate">Все консультации в системе</p>
                            </div>
                        </div>
                        <Button onClick={onCreateBooking} size="lg" className="shadow-xl w-full sm:w-auto">
                            <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                            Создать запись
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Статистика - мобильная версия с аккордеоном */}
            <Card className="booking-card border-2">
                <button
                    onClick={() => setShowStats(!showStats)}
                    className="w-full p-3 sm:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors md:hidden"
                >
                    <CardTitle className="text-base flex items-center gap-2 m-0">
                        <Calendar className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <span>Статистика записей</span>
                    </CardTitle>
                    {showStats ? (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                </button>

                {/* Десктоп заголовок */}
                <CardHeader className="hidden md:block pb-3">
                    <CardTitle className="text-base sm:text-lg">Статистика записей</CardTitle>
                </CardHeader>

                <CardContent className={`${!showStats && 'hidden md:block'} p-3 sm:p-6 md:pt-0`}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
                        <div className="p-2.5 sm:p-3 md:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border-2 border-amber-200">
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <div className="text-[10px] sm:text-xs font-semibold text-amber-700 uppercase truncate">Всего</div>
                                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600 flex-shrink-0" />
                            </div>
                            <div className="text-lg sm:text-xl md:text-2xl font-bold text-amber-900">{stats.total}</div>
                        </div>
                        <div className="p-2.5 sm:p-3 md:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-2 border-yellow-200">
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <div className="text-[10px] sm:text-xs font-semibold text-yellow-700 uppercase truncate">
                                    <span className="hidden sm:inline">Ожидают</span>
                                    <span className="sm:hidden">Ждут</span>
                                </div>
                                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-600 flex-shrink-0" />
                            </div>
                            <div className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-900">{stats.pending}</div>
                        </div>
                        <div className="p-2.5 sm:p-3 md:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border-2 border-green-200">
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <div className="text-[10px] sm:text-xs font-semibold text-green-700 uppercase truncate">
                                    <span className="hidden sm:inline">Подтверждены</span>
                                    <span className="sm:hidden">Подтв.</span>
                                </div>
                                <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />
                            </div>
                            <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-900">{stats.confirmed}</div>
                        </div>
                        <div className="p-2.5 sm:p-3 md:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-2 border-emerald-200">
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <div className="text-[10px] sm:text-xs font-semibold text-emerald-700 uppercase truncate">
                                    <span className="hidden sm:inline">Завершены</span>
                                    <span className="sm:hidden">Заверш.</span>
                                </div>
                                <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 flex-shrink-0" />
                            </div>
                            <div className="text-lg sm:text-xl md:text-2xl font-bold text-emerald-900">{stats.completed}</div>
                        </div>
                        <div className="p-2.5 sm:p-3 md:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 border-2 border-red-200">
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <div className="text-[10px] sm:text-xs font-semibold text-red-700 uppercase truncate">
                                    <span className="hidden sm:inline">Отменены</span>
                                    <span className="sm:hidden">Отмен.</span>
                                </div>
                                <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600 flex-shrink-0" />
                            </div>
                            <div className="text-lg sm:text-xl md:text-2xl font-bold text-red-900">{stats.cancelled}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Фильтры и поиск - мобильная версия с аккордеоном */}
            <Card className="booking-card border-2">
                <button
                    onClick={() => setShowSearch(!showSearch)}
                    className="w-full p-3 sm:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors md:hidden"
                >
                    <CardTitle className="text-base flex items-center gap-2 m-0">
                        <Search className="h-5 w-5 text-primary-600 flex-shrink-0" />
                        <span>Поиск и фильтры</span>
                    </CardTitle>
                    {showSearch ? (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                </button>

                {/* Десктоп заголовок */}
                <CardHeader className="hidden md:block pb-3">
                    <CardTitle className="text-lg">Поиск и фильтрация</CardTitle>
                </CardHeader>

                <CardContent className={`${!showSearch && 'hidden md:block'} space-y-3 sm:space-y-4 p-3 sm:p-6 md:pt-0`}>
                    {/* Поиск */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    loadBookings(1, false)
                                }
                            }}
                            placeholder="Поиск по имени, телефону, email..."
                            className="pl-9 sm:pl-10 h-10 sm:h-auto text-sm sm:text-base"
                        />
                    </div>

                    {/* Быстрые фильтры */}
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {[
                            { key: 'all' as QuickFilter, label: 'Все' },
                            { key: 'today' as QuickFilter, label: 'Сегодня' },
                            { key: 'week' as QuickFilter, label: 'Неделя', shortLabel: 'Неделя' },
                            { key: 'month' as QuickFilter, label: 'Месяц', shortLabel: 'Месяц' },
                            { key: 'upcoming' as QuickFilter, label: 'Предстоящие', shortLabel: 'Предстоящие' },
                            { key: 'past' as QuickFilter, label: 'Прошедшие', shortLabel: 'Прошедшие' },
                        ].map(({ key, label, shortLabel }) => (
                            <button
                                key={key}
                                onClick={() => setQuickFilter(key)}
                                className={cn(
                                    'px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all',
                                    quickFilter === key
                                        ? 'bg-primary-500 text-white shadow-md'
                                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-primary-50'
                                )}
                            >
                                <span className="hidden sm:inline">{label}</span>
                                <span className="sm:hidden">{shortLabel || label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Переключатель вида и фильтры */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowFilters(!showFilters)}
                                className="flex-1 sm:flex-none h-9"
                            >
                                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
                                Фильтры
                            </Button>
                            <Button
                                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('calendar')}
                                className="flex-1 sm:flex-none h-9 hidden md:flex"
                            >
                                <CalendarDays className="h-4 w-4 mr-2" />
                                Календарь
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => loadBookings(1, false)} className="h-9">
                                Применить
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSearchQuery('')
                                    setSelectedStatuses([])
                                    setQuickFilter('all')
                                    setDateRange({
                                        start: format(startOfDay(new Date()), 'yyyy-MM-dd'),
                                        end: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
                                    })
                                    loadBookings(1, false)
                                }}
                                className="h-9"
                            >
                                Сбросить
                            </Button>
                        </div>
                    </div>

                    {showFilters && (
                        <div className="grid gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-xl border border-gray-200">
                            {/* Статусы */}
                            <div>
                                <label className="text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2 block">Статусы</label>
                                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                    {['pending_payment', 'confirmed', 'completed', 'cancelled'].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => handleStatusToggle(status)}
                                            className={cn(
                                                'px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all',
                                                selectedStatuses.includes(status)
                                                    ? 'bg-primary-500 text-white'
                                                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-primary-50'
                                            )}
                                        >
                                            {status === 'pending_payment' && '🟡 Ожидает'}
                                            {status === 'confirmed' && '✅ Подтвержденные'}
                                            {status === 'completed' && '✅ Завершенные'}
                                            {status === 'cancelled' && '❌ Отмена'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Период */}
                            <div className="grid gap-3 sm:gap-4 grid-cols-2">
                                <div>
                                    <label className="text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2 block">С</label>
                                    <Input
                                        type="date"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                        className="h-10 sm:h-auto text-sm sm:text-base"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2 block">По</label>
                                    <Input
                                        type="date"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                        className="h-10 sm:h-auto text-sm sm:text-base"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Массовые действия */}
            {selectedBookings.size > 0 && (
                <Card className="booking-card border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white">
                    <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                            <div className="flex items-center gap-2">
                                <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600" />
                                <span className="font-bold text-sm sm:text-base text-primary-900">
                                    Выбрано: {selectedBookings.size}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => handleBulkStatusChange('confirmed')} className="h-8 text-xs">
                                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                                    Подтвердить
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => handleBulkStatusChange('completed')} className="h-8 text-xs">
                                    Завершить
                                </Button>
                                <Button size="sm" variant="secondary" onClick={handleBulkCancel} className="h-8 text-xs">
                                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                                    Отменить
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={handleBulkDelete}
                                    className="text-red-600 hover:bg-red-50 border-red-200 hover:border-red-300 h-8 text-xs"
                                >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    Удалить
                                </Button>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedBookings(new Set())} className="sm:ml-auto h-8 text-xs">
                                Сбросить
                            </Button>
                        </div>
                        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-primary-100">
                            <p className="text-[10px] sm:text-xs text-gray-600">
                                <span className="font-medium">Отменить:</span> помечает записи как отмененные (остаются в истории)
                                <br />
                                <span className="font-medium">Удалить:</span> полностью удаляет записи из базы (необратимо)
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Календарное представление - скрыто на мобильных */}
            {viewMode === 'calendar' && !isLoading && (
                <div className="hidden md:block">
                    <BookingsCalendar
                        bookings={bookings}
                        currentDate={calendarDate}
                        onDateChange={setCalendarDate}
                        onDayClick={handleDayClick}
                    />

                    {/* Модальное окно для выбранного дня */}
                    {selectedDayBookings && selectedDayBookings.length > 0 && (
                        <Card className="booking-card border-2 mt-6">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>
                                        Записи на {format(parseISO(selectedDayBookings[0].booking_date), 'd MMMM yyyy', { locale: ru })}
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedDayBookings([])}>
                                        <XCircle className="h-5 w-5" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {selectedDayBookings.map((booking) => (
                                    <div
                                        key={booking.id}
                                        onClick={() => setDetailsBooking(booking)}
                                        className="booking-card border-2 p-4 hover:shadow-xl transition-all cursor-pointer"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <StatusBadge status={booking.status} />
                                                    <span className="text-sm font-bold text-blue-900">
                                                        {booking.booking_time}
                                                    </span>
                                                </div>
                                                <p className="font-bold text-gray-900">{booking.client_name}</p>
                                                <p className="text-sm text-gray-600">{booking.client_phone}</p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-bold text-primary-600">
                                                    {(booking.amount || 0).toLocaleString('ru-RU')} ₽
                                                </div>
                                                <Button size="sm" variant="ghost" onClick={(e) => {
                                                    e.stopPropagation()
                                                    setDetailsBooking(booking)
                                                }}>
                                                    <Eye className="h-4 w-4 mr-2" />
                                                    Детали
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Список записей */}
            {viewMode === 'list' && isLoading ? (
                <Card className="booking-card border-2">
                    <CardContent className="py-12 sm:py-20 text-center">
                        <div className="flex flex-col items-center gap-3 sm:gap-4">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
                            <p className="text-base sm:text-lg font-semibold text-gray-700">Загрузка записей...</p>
                        </div>
                    </CardContent>
                </Card>
            ) : viewMode === 'list' && bookings.length === 0 ? (
                <Card className="booking-card border-2 text-center">
                    <CardContent className="py-12 sm:py-20">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4 sm:mb-6">
                            <span className="text-3xl sm:text-4xl">📭</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2 sm:mb-3">Записи не найдены</h3>
                        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Попробуйте изменить параметры фильтрации или создайте новую запись</p>
                        <Button onClick={onCreateBooking} size="lg" className="shadow-xl w-full sm:w-auto">
                            <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                            Создать первую запись
                        </Button>
                    </CardContent>
                </Card>
            ) : viewMode === 'list' && (
                <div className="space-y-3 sm:space-y-6">
                    {/* Сортировка */}
                    <Card className="booking-card border-2">
                        <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
                            <CardTitle className="text-sm sm:text-base md:text-lg">Сортировка и выбор</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6 pt-0 sm:pt-0">
                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2">
                                {[
                                    { key: 'date' as SortField, label: 'По дате', shortLabel: 'Дата' },
                                    { key: 'created_at' as SortField, label: 'По созданию', shortLabel: 'Создан' },
                                    { key: 'status' as SortField, label: 'По статусу', shortLabel: 'Статус' },
                                    { key: 'amount' as SortField, label: 'По сумме', shortLabel: 'Сумма' },
                                    { key: 'client_name' as SortField, label: 'По имени', shortLabel: 'Имя' },
                                ].map(({ key, label, shortLabel }) => (
                                    <button
                                        key={key}
                                        onClick={() => handleSort(key)}
                                        className={cn(
                                            'px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-1 whitespace-nowrap',
                                            sortField === key
                                                ? 'bg-primary-500 text-white'
                                                : 'bg-white text-gray-700 border border-gray-200 hover:bg-primary-50'
                                        )}
                                    >
                                        <span className="hidden sm:inline">{label}</span>
                                        <span className="sm:hidden">{shortLabel}</span>
                                        {sortField === key && (
                                            <ArrowUpDown className={cn(
                                                "h-3 w-3 transition-transform flex-shrink-0",
                                                sortDirection === 'desc' && 'rotate-180'
                                            )} />
                                        )}
                                    </button>
                                ))}
                            </div>
                            {bookings.length > 0 && (
                                <div className="pt-2 sm:pt-3 border-t-2 border-gray-100">
                                    <button
                                        onClick={handleSelectAll}
                                        className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-all flex items-center gap-2"
                                    >
                                        {selectedBookings.size === bookings.length ? (
                                            <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600" />
                                        ) : (
                                            <Square className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                                        )}
                                        {selectedBookings.size === bookings.length ? 'Снять выбор' : 'Выбрать все'}
                                    </button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Список записей по датам */}
                    {groupedBookings.map(([date, dateBookings]) => (
                        <Card key={date} className="booking-card border-2">
                            <CardHeader className="pb-2 sm:pb-3 md:pb-4 bg-gradient-to-br from-amber-50 to-white border-b-2 border-amber-100 p-3 sm:p-4 md:p-6">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg flex-shrink-0">
                                        <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                                    </div>
                                    <CardTitle className="text-sm sm:text-base md:text-xl truncate">
                                        {format(parseISO(date), 'd MMMM yyyy', { locale: ru })}
                                    </CardTitle>
                                    <span className="ml-auto text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 flex-shrink-0">
                                        {dateBookings.length} {dateBookings.length === 1 ? 'запись' : 'записей'}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-2 sm:p-3 md:p-4 space-y-2 sm:space-y-3">
                                {dateBookings.map((booking) => (
                                    <div key={booking.id} className="booking-card border-2 p-3 sm:p-4 md:p-5 hover:shadow-xl transition-all">
                                        <div className="flex flex-col gap-3 sm:gap-4">
                                            <div className="flex items-start gap-2 sm:gap-3">
                                                <button
                                                    onClick={() => handleSelectBooking(booking.id)}
                                                    className="mt-1 hover:scale-110 transition-transform flex-shrink-0 hidden sm:block"
                                                >
                                                    {selectedBookings.has(booking.id) ? (
                                                        <CheckSquare className="h-5 w-5 sm:h-6 sm:w-6 text-primary-600" />
                                                    ) : (
                                                        <Square className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" />
                                                    )}
                                                </button>
                                                <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
                                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                                        <StatusBadge status={booking.status} />
                                                        <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                                                            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600 flex-shrink-0" />
                                                            <span className="text-xs sm:text-sm font-bold text-blue-900 whitespace-nowrap">
                                                                {booking.booking_time}
                                                            </span>
                                                        </div>
                                                        <div className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200">
                                                            <span className="text-xs sm:text-sm font-bold text-purple-900 whitespace-nowrap">
                                                                {(booking.amount || 0).toLocaleString('ru-RU')} ₽
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5 sm:space-y-2">
                                                        {/* Кликабельное имя клиента */}
                                                        <Link
                                                            href={`/admin/clients/${booking.client_id}`}
                                                            className="group inline-block"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <p className="text-sm sm:text-base md:text-lg font-bold text-blue-900 break-words hover:text-primary-700 hover:underline transition-colors flex items-center gap-1.5 sm:gap-2">
                                                                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 text-primary-500 group-hover:text-primary-600 transition-colors" />
                                                                {booking.client_name}
                                                            </p>
                                                        </Link>
                                                        <div className="space-y-1 sm:space-y-1.5">
                                                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                                                                <span className="flex-shrink-0">📱</span>
                                                                <span className="break-all">{booking.client_phone}</span>
                                                            </div>
                                                            {booking.client_email && (
                                                                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                                                                    <span className="flex-shrink-0">✉️</span>
                                                                    <span className="break-all">{booking.client_email}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {booking.product_description && (
                                                            <div className="mt-1.5 sm:mt-2 p-2 sm:p-3 rounded-lg bg-purple-50 border border-purple-200">
                                                                <p className="text-xs sm:text-sm text-purple-900 break-words">📝 {booking.product_description}</p>
                                                            </div>
                                                        )}
                                                        {booking.notes && (
                                                            <div className="mt-1.5 sm:mt-2 p-2 sm:p-3 rounded-lg bg-gray-50 border border-gray-200">
                                                                <p className="text-xs sm:text-sm text-gray-700 italic break-words">💬 {booking.notes}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-2 pt-2 sm:pt-3 border-t border-gray-100">
                                                {/* Мобильная версия - только кнопка "Детали" */}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDetailsBooking(booking)}
                                                    className="w-full sm:w-auto justify-center sm:justify-start h-9 sm:h-auto"
                                                >
                                                    <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
                                                    Детали
                                                </Button>

                                                {/* Десктоп версия - все кнопки */}
                                                <div className="hidden sm:flex sm:flex-wrap gap-2">
                                                    <Button
                                                        asChild
                                                        variant="secondary"
                                                        size="sm"
                                                    >
                                                        <Link href={`/admin/clients/${booking.client_id}`}>
                                                            <User className="h-4 w-4 mr-2" />
                                                            Профиль клиента
                                                        </Link>
                                                    </Button>
                                                    {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleRescheduleOpen(booking)}
                                                            title="Перенести дату/время записи"
                                                        >
                                                            <Edit className="h-4 w-4 mr-2" />
                                                            Перенести
                                                        </Button>
                                                    )}
                                                    {booking.status === 'pending_payment' && (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleMarkPaid(booking.id)}
                                                            className="bg-green-600 hover:bg-green-700"
                                                        >
                                                            <CheckCircle className="h-4 w-4 mr-2" />
                                                            Оплачено
                                                        </Button>
                                                    )}
                                                    {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleCancel(booking.id)}
                                                            title="Отменить запись (остается в истории)"
                                                        >
                                                            <Ban className="h-4 w-4 mr-2" />
                                                            Отменить
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(booking.id)}
                                                        className="hover:bg-red-50 hover:text-red-600"
                                                        title="Полностью удалить запись из базы"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Удалить
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Кнопка "Показать еще" */}
            {viewMode === 'list' && (hasMore || isLoadingMore) && (
                <LoadMoreButton
                    onClick={loadMore}
                    isLoading={isLoadingMore}
                    hasMore={hasMore}
                />
            )}

            {/* Модальное окно деталей записи */}
            {detailsBooking && (
                <BookingDetailsModal
                    booking={detailsBooking}
                    onClose={() => setDetailsBooking(null)}
                    onDelete={handleDelete}
                    onCancel={handleCancel}
                    onReschedule={(b) => {
                        setDetailsBooking(null)
                        handleRescheduleOpen(b)
                    }}
                    onStatusChange={handleStatusChange}
                />
            )}

            {rescheduleBooking && (
                <RescheduleBookingModal
                    booking={rescheduleBooking}
                    open={!!rescheduleBooking}
                    onClose={() => setRescheduleBooking(null)}
                    onSuccess={(updated) => {
                        setBookings((prev) =>
                            prev.map((b) =>
                                b.id === updated.id
                                    ? { ...b, booking_date: updated.booking_date, booking_time: updated.booking_time }
                                    : b
                            )
                        )
                    }}
                />
            )}
        </div>
    )
}