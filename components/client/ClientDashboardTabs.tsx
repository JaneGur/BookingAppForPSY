'use client'

import {useEffect, useMemo, useState} from 'react'
import {useRouter, useSearchParams} from 'next/navigation'
import {useSession} from 'next-auth/react'
import {
    Bell,
    BellOff,
    Calendar,
    CheckCircle,
    ChevronRight,
    Home,
    LineChart,
    Lock,
    Mail,
    Menu,
    MessageSquare,
    Phone,
    User,
    X
} from 'lucide-react'

import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Booking} from '@/types/booking'
import {formatDistanceToNowStrict} from 'date-fns'
import {ru} from 'date-fns/locale'
import {useClientBookings, usePendingBooking, useUpcomingBooking} from '@/lib/hooks/useBookings'
import {BookingActions} from '@/components/client/BookingActions'
import {ClientNewBookingForm} from '@/components/client/ClientNewBookingForm'
import {TelegramConnect} from '@/components/client/TelegramConnect'
import {formatDateRu} from '@/lib/utils/date'
import {ClientBookingsCalendar} from '@/components/client/ClientBookingsCalendar'
import {cn} from '@/lib/utils/cn'

type TabKey = 'home' | 'new' | 'history' | 'profile' | 'telegram'

interface ClientProfile {
    name: string
    email?: string
    phone: string
    telegram_chat_id?: string
    telegram?: string
}

function StatusBadge({ status }: { status: Booking['status'] }) {
    const base = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all duration-300'

    const map: Record<Booking['status'], { label: string; className: string; icon: string }> = {
        pending_payment: { label: 'Ожидает оплаты', className: 'bg-gradient-to-br from-yellow-100 to-yellow-200 text-yellow-800 border-2 border-yellow-300', icon: '⏳' },
        confirmed: { label: 'Подтверждена', className: 'bg-gradient-to-br from-green-100 to-green-200 text-green-800 border-2 border-green-300', icon: '✓' },
        completed: { label: 'Завершена', className: 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-800 border-2 border-emerald-300', icon: '✓' },
        cancelled: { label: 'Отменена', className: 'bg-gradient-to-br from-red-100 to-red-200 text-red-800 border-2 border-red-300', icon: '✕' },
    }

    const item = map[status]

    return <span className={`${base} ${item.className}`}><span className="text-sm">{item.icon}</span> {item.label}</span>
}

// 🔧 АДАПТИВНАЯ КНОПКА
function ResponsiveButton({
                              children,
                              icon,
                              size = "default",
                              variant = "default",
                              className = "",
                              ...props
                          }: any) {
    return (
        <Button
            size={size}
            variant={variant}
            className={cn(
                "transition-all duration-300",
                size === "lg" && "h-10 md:h-12 px-4 md:px-6 text-sm md:text-base",
                size === "default" && "h-9 md:h-10 px-3 md:px-4 text-xs md:text-sm",
                size === "sm" && "h-8 md:h-9 px-2 md:px-3 text-xs",
                className
            )}
            {...props}
        >
            {icon && <span className="mr-2">{icon}</span>}
            {children}
        </Button>
    )
}

export function ClientDashboardTabs() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { data: session, status } = useSession()

    const [tab, setTab] = useState<TabKey>('home')
    const [profile, setProfile] = useState<ClientProfile | null>(null)
    const [isLoadingProfile, setIsLoadingProfile] = useState(true)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const phone = session?.user?.phone

    const { data: bookings = [], isLoading: isBookingsLoading } = useClientBookings(phone)
    const { data: pendingBooking } = usePendingBooking(phone)
    const { data: upcomingBooking } = useUpcomingBooking(phone)

    // Загружаем профиль пользователя и обновляем статусы записей
    useEffect(() => {
        async function loadProfile() {
            if (!session?.user?.id) {
                setIsLoadingProfile(false)
                return
            }

            try {
                // Обновляем статусы прошедших записей
                fetch('/api/bookings/update-statuses', { method: 'POST' }).catch(() => {})
                
                const res = await fetch('/api/profile')
                if (res.ok) {
                    const data = (await res.json()) as ClientProfile
                    setProfile(data)
                }
            } catch (error) {
                console.error('Failed to load profile:', error)
            } finally {
                setIsLoadingProfile(false)
            }
        }

        loadProfile()
    }, [session?.user?.id])

    useEffect(() => {
        if (searchParams?.get('connectTelegram') === '1') {
            setTab('telegram')
        }
    }, [searchParams])

    const upcomingConfirmed = useMemo(() => {
        if (!Array.isArray(bookings)) return []
        const now = new Date()
        // Фильтруем только подтвержденные записи, дата и время которых еще не наступили
        const list = bookings.filter((b: Booking) => {
            if (b.status !== 'confirmed') return false
            const bookingDateTime = new Date(`${b.booking_date}T${b.booking_time}:00+03:00`)
            return bookingDateTime > now
        })
        list.sort((a: Booking, b: Booking) => {
            const aDt = Date.parse(`${a.booking_date}T${a.booking_time}:00+03:00`)
            const bDt = Date.parse(`${b.booking_date}T${b.booking_time}:00+03:00`)
            return aDt - bDt
        })
        return list
    }, [bookings])

    const hasTelegramNotifications = !!profile?.telegram_chat_id

    if (status === 'loading' || isLoadingProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="booking-card max-w-md w-full">
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        <span className="text-lg font-semibold text-gray-700 text-center">Загрузка…</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4 md:space-y-6 lg:space-y-8 animate-[fadeInUp_0.6s_ease-out]">
            {/* Мобильное меню */}
            <div className="lg:hidden fixed top-4 right-4 z-50">
                <ResponsiveButton
                    variant="secondary"
                    size="icon"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="h-12 w-12 rounded-xl shadow-lg bg-white border-2"
                    icon={mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                />

                {mobileMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl border-2 border-primary-200 shadow-2xl p-2 animate-fadeInUp">
                        <div className="space-y-1">
                            <MobileMenuItem
                                icon={<Home className="h-4 w-4" />}
                                label="Главная"
                                active={tab === 'home'}
                                onClick={() => {
                                    setTab('home')
                                    setMobileMenuOpen(false)
                                }}
                            />
                            <MobileMenuItem
                                icon={<Calendar className="h-4 w-4" />}
                                label="Записаться"
                                active={tab === 'new'}
                                onClick={() => {
                                    setTab('new')
                                    setMobileMenuOpen(false)
                                }}
                            />
                            <MobileMenuItem
                                icon={<LineChart className="h-4 w-4" />}
                                label="История"
                                active={tab === 'history'}
                                onClick={() => {
                                    setTab('history')
                                    setMobileMenuOpen(false)
                                }}
                            />
                            <MobileMenuItem
                                icon={<User className="h-4 w-4" />}
                                label="Профиль"
                                active={tab === 'profile'}
                                onClick={() => {
                                    setTab('profile')
                                    setMobileMenuOpen(false)
                                }}
                            />
                            <MobileMenuItem
                                icon={<MessageSquare className="h-4 w-4" />}
                                label="Telegram"
                                active={tab === 'telegram'}
                                onClick={() => {
                                    setTab('telegram')
                                    setMobileMenuOpen(false)
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Заголовок и табы */}
            <div className="booking-card p-4 md:p-6">
                <div className="flex flex-col gap-4 md:gap-6">
                    {/* Заголовок */}
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg">
                            <User className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                                Личный кабинет
                            </h1>
                            <p className="text-xs md:text-sm lg:text-base text-gray-600 mt-0.5 md:mt-1 truncate">
                                Управление записями и профилем
                            </p>
                        </div>
                    </div>

                    {/* Десктопные табы */}
                    <div className="hidden lg:grid grid-cols-5 gap-2 md:gap-3">
                        <DesktopTabButton
                            icon={<Home className="h-4 w-4 md:h-5 md:w-5" />}
                            label="Главная"
                            active={tab === 'home'}
                            onClick={() => setTab('home')}
                        />
                        <DesktopTabButton
                            icon={<Calendar className="h-4 w-4 md:h-5 md:w-5" />}
                            label="Записаться"
                            active={tab === 'new'}
                            onClick={() => setTab('new')}
                        />
                        <DesktopTabButton
                            icon={<LineChart className="h-4 w-4 md:h-5 md:w-5" />}
                            label="История"
                            active={tab === 'history'}
                            onClick={() => setTab('history')}
                        />
                        <DesktopTabButton
                            icon={<User className="h-4 w-4 md:h-5 md:w-5" />}
                            label="Профиль"
                            active={tab === 'profile'}
                            onClick={() => setTab('profile')}
                        />
                        <DesktopTabButton
                            icon={<MessageSquare className="h-4 w-4 md:h-5 md:w-5" />}
                            label="Telegram"
                            active={tab === 'telegram'}
                            onClick={() => setTab('telegram')}
                        />
                    </div>

                    {/* Мобильные табы (горизонтальный скролл) */}
                    <div className="lg:hidden">
                        <div className="flex space-x-2 overflow-x-auto pb-2 -mx-2 px-2">
                            <MobileTabButton
                                icon={<Home className="h-4 w-4" />}
                                label="Главная"
                                active={tab === 'home'}
                                onClick={() => setTab('home')}
                            />
                            <MobileTabButton
                                icon={<Calendar className="h-4 w-4" />}
                                label="Записаться"
                                active={tab === 'new'}
                                onClick={() => setTab('new')}
                            />
                            <MobileTabButton
                                icon={<LineChart className="h-4 w-4" />}
                                label="История"
                                active={tab === 'history'}
                                onClick={() => setTab('history')}
                            />
                            <MobileTabButton
                                icon={<User className="h-4 w-4" />}
                                label="Профиль"
                                active={tab === 'profile'}
                                onClick={() => setTab('profile')}
                            />
                            <MobileTabButton
                                icon={<MessageSquare className="h-4 w-4" />}
                                label="Telegram"
                                active={tab === 'telegram'}
                                onClick={() => setTab('telegram')}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {tab === 'home' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                    <div className="lg:col-span-2 space-y-4 md:space-y-6">
                        {pendingBooking ? (
                            <Card className="booking-card border-2 border-yellow-300/50 bg-gradient-to-br from-yellow-50/50 to-white relative overflow-hidden p-4 md:p-6">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400" />
                                <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg flex-shrink-0">
                                        <span className="text-xl md:text-2xl">⏳</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-2">
                                            Ожидает оплаты
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge status={pendingBooking.status} />
                                                <div className="text-sm md:text-base font-semibold text-gray-800 flex items-center gap-1 md:gap-2">
                                                    <Calendar className="h-4 w-4 md:h-5 md:w-5 text-primary-600" />
                                                    {formatDateRu(pendingBooking.booking_date)} в {pendingBooking.booking_time}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <BookingActions booking={pendingBooking} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ) : null}

                        {upcomingBooking ? (
                            <Card className="booking-card border-2 border-green-300/50 bg-gradient-to-br from-green-50/50 to-white relative overflow-hidden p-4 md:p-6">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 via-green-500 to-green-400" />
                                <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg flex-shrink-0">
                                        <Calendar className="h-5 w-5 md:h-6 md:w-6 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-2">
                                            Ближайшая консультация
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge status={upcomingBooking.status} />
                                                <div className="text-sm md:text-base font-semibold text-gray-800 flex items-center gap-1 md:gap-2">
                                                    <Calendar className="h-4 w-4 md:h-5 md:w-5 text-primary-600" />
                                                    {formatDateRu(upcomingBooking.booking_date)} в {upcomingBooking.booking_time}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 p-3 md:p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border-2 border-blue-200">
                                                <div className="text-xl md:text-2xl">⏱️</div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-blue-700 uppercase truncate">До начала</div>
                                                    <div className="text-sm md:text-base font-bold text-blue-900 truncate">
                                                        {(() => {
                                                            try {
                                                                const dateStr = `${upcomingBooking.booking_date}T${upcomingBooking.booking_time}`;
                                                                const date = new Date(dateStr);
                                                                if (isNaN(date.getTime())) {
                                                                    return 'Скоро';
                                                                }
                                                                return formatDistanceToNowStrict(date, { locale: ru });
                                                            } catch {
                                                                return 'Скоро';
                                                            }
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                            {(upcomingBooking.status === 'confirmed' || upcomingBooking.status === 'pending_payment') && (
                                                <div className="flex flex-wrap gap-2">
                                                    <BookingActions booking={upcomingBooking} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ) : null}

                        {!pendingBooking && !upcomingBooking ? (
                            <Card className="booking-card border-2 border-gray-200 text-center p-4 md:p-6">
                                <CardContent className="py-8 md:py-12">
                                    <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4 md:mb-6">
                                        <span className="text-3xl md:text-4xl">📭</span>
                                    </div>
                                    <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800 mb-3 md:mb-4">
                                        Нет предстоящих консультаций
                                    </h3>
                                    <p className="text-sm md:text-base text-gray-600 mb-4 md:mb-6 max-w-md mx-auto">
                                        Запишитесь на новую консультацию и начните свой путь к внутренней гармонии
                                    </p>
                                    <ResponsiveButton
                                        onClick={() => setTab('new')}
                                        size="lg"
                                        variant="default"
                                        className="w-full md:w-auto shadow-lg"
                                        icon={<Calendar className="h-4 w-4 md:h-5 md:w-5" />}
                                    >
                                        Записаться на консультацию
                                    </ResponsiveButton>
                                </CardContent>
                            </Card>
                        ) : null}
                    </div>

                    <div className="space-y-4 md:space-y-6">
                        <Card className="info-panel border-2">
                            <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6">
                                <div className="flex items-center gap-2">
                                    <LineChart className="h-4 w-4 md:h-5 md:w-5 text-primary-600" />
                                    <div className="text-base md:text-lg font-bold text-gray-800">Статистика</div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                                    <div className="rounded-xl md:rounded-2xl bg-gradient-to-br from-primary-50 to-white border-2 border-primary-200/50 p-3 md:p-4 hover:shadow-lg transition-shadow">
                                        <div className="flex items-center justify-between mb-1 md:mb-2">
                                            <div className="text-xs md:text-sm font-semibold text-primary-700 truncate">Предстоящих</div>
                                            <Calendar className="h-4 w-4 md:h-5 md:w-5 text-primary-600 flex-shrink-0" />
                                        </div>
                                        <div className="text-xl md:text-2xl lg:text-3xl font-bold text-primary-900">
                                            {upcomingConfirmed.length}
                                        </div>
                                    </div>
                                    <div className="rounded-xl md:rounded-2xl bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200/50 p-3 md:p-4 hover:shadow-lg transition-shadow">
                                        <div className="flex items-center justify-between mb-1 md:mb-2">
                                            <div className="text-xs md:text-sm font-semibold text-blue-700 truncate">Всего записей</div>
                                            <LineChart className="h-4 w-4 md:h-5 md:w-5 text-blue-600 flex-shrink-0" />
                                        </div>
                                        <div className="text-xl md:text-2xl lg:text-3xl font-bold text-blue-900">
                                            {Array.isArray(bookings) ? bookings.length : 0}
                                        </div>
                                    </div>
                                    <div className="col-span-2 md:col-span-1 rounded-xl md:rounded-2xl bg-gradient-to-br from-green-50 to-white border-2 border-green-200/50 p-3 md:p-4 hover:shadow-lg transition-shadow">
                                        <div className="flex items-center justify-between mb-1 md:mb-2">
                                            <div className="text-xs md:text-sm font-semibold text-green-700 truncate">Telegram</div>
                                            <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-green-600 flex-shrink-0" />
                                        </div>
                                        <div className="text-sm md:text-base font-bold text-green-900 truncate">
                                            {hasTelegramNotifications ? '✅ Подключен' : '❌ Не подключен'}
                                        </div>
                                        {!hasTelegramNotifications && (
                                            <ResponsiveButton
                                                onClick={() => setTab('telegram')}
                                                variant="ghost"
                                                size="sm"
                                                className="w-full mt-2"
                                            >
                                                Подключить
                                            </ResponsiveButton>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Краткая информация для мобильных */}
                        {hasTelegramNotifications ? (
                            <div className="lg:hidden p-3 rounded-xl bg-gradient-to-br from-green-50 to-green-100/30 border-2 border-green-200">
                                <div className="flex items-center gap-2">
                                    <Bell className="h-4 w-4 text-green-600 flex-shrink-0" />
                                    <span className="text-sm font-medium text-green-800 truncate">Уведомления Telegram активны</span>
                                </div>
                            </div>
                        ) : (
                            <div className="lg:hidden p-3 rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100/30 border-2 border-yellow-200">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <BellOff className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                                        <span className="text-sm font-medium text-yellow-800 truncate">Без уведомлений</span>
                                    </div>
                                    <ResponsiveButton
                                        onClick={() => setTab('telegram')}
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 flex-shrink-0"
                                    >
                                        Подключить
                                    </ResponsiveButton>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'new' && (
                <Card className="booking-card border-2 p-4 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4 mb-4 md:mb-6">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg flex-shrink-0">
                            <Calendar className="h-5 w-5 md:h-6 md:w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">Новая запись</h2>
                            <p className="text-xs md:text-sm text-gray-600 mt-0.5 md:mt-1">Выберите удобное время для консультации</p>
                        </div>
                    </div>

                    <CardContent className="space-y-4 md:space-y-6 p-0">
                        {pendingBooking ? (
                            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-2 border-yellow-300 p-4 md:p-6 rounded-xl md:rounded-2xl">
                                <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-yellow-400 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xl md:text-2xl">⏳</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base md:text-lg font-bold text-yellow-900 mb-1 md:mb-2">
                                            У вас уже есть созданный заказ
                                        </h3>
                                        <p className="text-xs md:text-sm text-yellow-800 mb-3 md:mb-4">
                                            Пожалуйста, завершите оплату существующей записи перед созданием новой
                                        </p>
                                        <ResponsiveButton
                                            onClick={() => setTab('home')}
                                            size="lg"
                                            variant="default"
                                            className="w-full md:w-auto bg-yellow-600 hover:bg-yellow-700"
                                        >
                                            Вернуться на главную
                                        </ResponsiveButton>
                                    </div>
                                </div>
                            </div>
                        ) : upcomingConfirmed.length > 0 ? (
                            <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-2 border-amber-300 p-4 md:p-6 rounded-xl md:rounded-2xl">
                                <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xl md:text-2xl">⚠️</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base md:text-lg font-bold text-amber-900 mb-1 md:mb-2">
                                            У вас уже есть активная запись
                                        </h3>
                                        <p className="text-xs md:text-sm text-amber-800 mb-3 md:mb-4">
                                            Вы можете создать новую запись после завершения текущей консультации
                                        </p>
                                        <ResponsiveButton
                                            onClick={() => setTab('home')}
                                            size="lg"
                                            variant="secondary"
                                            className="w-full md:w-auto"
                                        >
                                            Посмотреть на главной
                                        </ResponsiveButton>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <ClientNewBookingForm />
                        )}
                    </CardContent>
                </Card>
            )}

            {tab === 'history' && (
                <Card className="booking-card border-2 p-4 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4 mb-4 md:mb-6">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg flex-shrink-0">
                            <Calendar className="h-5 w-5 md:h-6 md:w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">История записей</h2>
                            <p className="text-xs md:text-sm text-gray-600 mt-0.5 md:mt-1">Все ваши консультации в календаре</p>
                        </div>
                    </div>

                    <CardContent className="space-y-4 md:space-y-6 p-0">
                        {isBookingsLoading ? (
                            <div className="flex flex-col items-center justify-center py-8 md:py-12 gap-3 md:gap-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                                <span className="text-base md:text-lg font-semibold text-gray-700 text-center">Загрузка истории записей…</span>
                            </div>
                        ) : !Array.isArray(bookings) || bookings.length === 0 ? (
                            <div className="text-center py-8 md:py-12">
                                <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4 md:mb-6">
                                    <span className="text-3xl md:text-4xl">📭</span>
                                </div>
                                <h3 className="text-lg md:text-xl font-bold text-gray-800 mb-2 md:mb-3">История записей пуста</h3>
                                <p className="text-sm md:text-base text-gray-600 mb-4 md:mb-6 max-w-md mx-auto">
                                    Создайте первую запись, чтобы начать отслеживать свои консультации
                                </p>
                                <ResponsiveButton
                                    onClick={() => setTab('new')}
                                    size="lg"
                                    variant="default"
                                    className="w-full md:w-auto shadow-lg"
                                    icon={<Calendar className="h-4 w-4 md:h-5 md:w-5" />}
                                >
                                    Создать первую запись
                                </ResponsiveButton>
                            </div>
                        ) : (
                            <ClientBookingsCalendar bookings={bookings} />
                        )}
                    </CardContent>
                </Card>
            )}

            {tab === 'profile' && <ProfileTab profile={profile} setProfile={setProfile} setTab={setTab} />}

            {tab === 'telegram' && <TelegramTab profile={profile} />}
        </div>
    )
}

// Компонент для мобильного таба
function MobileTabButton({ icon, label, active, onClick }: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center p-2 md:p-3 rounded-xl min-w-[70px] md:min-w-[80px] flex-shrink-0 transition-all duration-300",
                active
                    ? "bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg"
                    : "bg-white text-gray-700 border-2 border-gray-200 hover:bg-primary-50"
            )}
        >
            <div className={cn("mb-1", active ? "text-white" : "text-primary-600")}>
                {icon}
            </div>
            <span className="text-xs font-semibold whitespace-nowrap truncate">{label}</span>
        </button>
    )
}

// Компонент для десктопного таба
function DesktopTabButton({ icon, label, active, onClick }: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <Button
            variant={active ? "default" : "secondary"}
            onClick={onClick}
            className="h-auto py-3 md:py-4 flex-col gap-1.5 md:gap-2 transition-all duration-300"
        >
            {icon}
            <span className="text-xs md:text-sm font-semibold">{label}</span>
        </Button>
    )
}

// Компонент для пункта мобильного меню
function MobileMenuItem({ icon, label, active, onClick }: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center justify-between p-3 rounded-lg transition-all duration-300",
                active
                    ? "bg-gradient-to-r from-primary-500/10 to-primary-600/10 text-primary-700 border-l-4 border-primary-500"
                    : "text-gray-700 hover:bg-gray-50"
            )}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className={cn("p-1.5 rounded-md flex-shrink-0", active ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-600")}>
                    {icon}
                </div>
                <span className="font-medium truncate">{label}</span>
            </div>
            <ChevronRight className={cn("h-4 w-4 flex-shrink-0", active ? "text-primary-500" : "text-gray-400")} />
        </button>
    )
}

function ProfileTab({ profile, setProfile, setTab }: {
    profile: ClientProfile | null;
    setProfile: (profile: ClientProfile) => void;
    setTab: (tab: TabKey) => void;
}) {
    const { data: session } = useSession()
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')

    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newPasswordConfirm, setNewPasswordConfirm] = useState('')

    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        if (profile) {
            setName(String(profile.name ?? ''))
            setEmail(String(profile.email ?? ''))
        }
    }, [profile])

    if (!session?.user) {
        return null
    }

    const phone = session.user.phone

    return (
        <Card className="booking-card border-2 p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4 mb-4 md:mb-6">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg flex-shrink-0">
                    <User className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">Профиль</h2>
                    <p className="text-xs md:text-sm text-gray-600 mt-0.5 md:mt-1">Управление личными данными</p>
                </div>
            </div>

            <CardContent className="space-y-6 p-0">
                {message && (
                    <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 border-2 border-primary-200 p-3 md:p-4 rounded-xl md:rounded-2xl text-sm font-semibold text-gray-800 flex items-center gap-2 md:gap-3">
                        <span className="text-lg flex-shrink-0">{message.includes('✅') ? '✅' : 'ℹ️'}</span>
                        <span className="text-xs md:text-sm truncate">{message}</span>
                    </div>
                )}

                <div className="space-y-6">
                    <div>
                        <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3 md:mb-4 flex items-center gap-2">
                            <User className="h-4 w-4 md:h-5 md:w-5 text-primary-600 flex-shrink-0" />
                            Основная информация
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                            <div>
                                <label className="text-xs md:text-sm font-semibold text-gray-700 mb-1.5 md:mb-2 block flex items-center gap-1 md:gap-2">
                                    <User className="h-3 w-3 md:h-4 md:w-4 text-primary-600 flex-shrink-0" />
                                    Имя <span className="text-red-500">*</span>
                                </label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 md:h-12 text-sm md:text-base" />
                            </div>
                            <div>
                                <label className="text-xs md:text-sm font-semibold text-gray-700 mb-1.5 md:mb-2 block flex items-center gap-1 md:gap-2">
                                    <Mail className="h-3 w-3 md:h-4 md:w-4 text-primary-600 flex-shrink-0" />
                                    Email
                                </label>
                                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="h-10 md:h-12 text-sm md:text-base" />
                            </div>
                            <div>
                                <label className="text-xs md:text-sm font-semibold text-gray-700 mb-1.5 md:mb-2 block flex items-center gap-1 md:gap-2">
                                    <Phone className="h-3 w-3 md:h-4 md:w-4 text-primary-600 flex-shrink-0" />
                                    Телефон
                                </label>
                                <Input value={phone ?? ''} className="h-10 md:h-12 bg-gray-50 text-sm md:text-base" />
                            </div>
                            <div>
                                <label className="text-xs md:text-sm font-semibold text-gray-700 mb-1.5 md:mb-2 block flex items-center gap-1 md:gap-2">
                                    <MessageSquare className="h-3 w-3 md:h-4 md:w-4 text-primary-600 flex-shrink-0" />
                                    Telegram
                                </label>
                                {profile?.telegram_chat_id ? (
                                    <div className="relative">
                                        <Input
                                            value={profile.telegram ? `@${profile.telegram}` : 'Подключен'}
                                            disabled
                                            className="h-10 md:h-12 bg-green-50 border-green-300 text-green-900 font-semibold text-xs md:text-sm pr-8 md:pr-10"
                                        />
                                        <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2">
                                            <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-500" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Input
                                            value="Telegram не подключен"
                                            disabled
                                            className="h-10 md:h-12 bg-gray-100 border-gray-300 text-gray-600 text-xs md:text-sm"
                                        />
                                        <ResponsiveButton
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTab('telegram')}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-primary-600 hover:text-primary-700 hover:bg-primary-50 h-8 md:h-10"
                                        >
                                            Подключить
                                        </ResponsiveButton>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <ResponsiveButton
                            onClick={async () => {
                                setIsLoading(true)
                                setMessage(null)
                                const res = await fetch('/api/profile', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name, email }),
                                })
                                const data = (await res.json().catch(() => null)) as any
                                if (res.ok) {
                                    setMessage('✅ Профиль обновлен')
                                    if (data) {
                                        setProfile(data)
                                    }
                                } else {
                                    setMessage(String(data?.error ?? 'Ошибка'))
                                }
                                setIsLoading(false)
                            }}
                            disabled={isLoading}
                            size="lg"
                            className="w-full sm:w-auto"
                            icon={isLoading ? null : '💾'}
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                    Сохранение…
                                </>
                            ) : (
                                'Сохранить изменения'
                            )}
                        </ResponsiveButton>
                    </div>
                </div>

                <div className="border-t-2 border-gray-200 pt-4 md:pt-6 space-y-4 md:space-y-6">
                    <h3 className="text-base md:text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Lock className="h-4 w-4 md:h-5 md:w-5 text-primary-600 flex-shrink-0" />
                        Смена пароля
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div className="md:col-span-2">
                            <label className="text-xs md:text-sm font-semibold text-gray-700 mb-1.5 md:mb-2 block flex items-center gap-1 md:gap-2">
                                <Lock className="h-3 w-3 md:h-4 md:w-4 text-primary-600 flex-shrink-0" />
                                Текущий пароль
                            </label>
                            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-10 md:h-12 text-sm md:text-base" />
                        </div>
                        <div>
                            <label className="text-xs md:text-sm font-semibold text-gray-700 mb-1.5 md:mb-2 block flex items-center gap-1 md:gap-2">
                                <Lock className="h-3 w-3 md:h-4 md:w-4 text-primary-600 flex-shrink-0" />
                                Новый пароль
                            </label>
                            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-10 md:h-12 text-sm md:text-base" />
                        </div>
                        <div>
                            <label className="text-xs md:text-sm font-semibold text-gray-700 mb-1.5 md:mb-2 block flex items-center gap-1 md:gap-2">
                                <Lock className="h-3 w-3 md:h-4 md:w-4 text-primary-600 flex-shrink-0" />
                                Подтверждение
                            </label>
                            <Input type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} className="h-10 md:h-12 text-sm md:text-base" />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <ResponsiveButton
                            variant="secondary"
                            onClick={async () => {
                                if (!currentPassword || !newPassword || !newPasswordConfirm) {
                                    setMessage('Заполните поля пароля')
                                    return
                                }
                                if (newPassword !== newPasswordConfirm) {
                                    setMessage('Новый пароль и подтверждение не совпадают')
                                    return
                                }
                                setIsLoading(true)
                                setMessage(null)
                                const res = await fetch('/api/auth/change-password', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
                                })
                                const data = (await res.json().catch(() => null)) as any
                                setIsLoading(false)
                                setMessage(res.ok ? '✅ Пароль изменен' : String(data?.error ?? 'Ошибка'))
                                if (res.ok) {
                                    setCurrentPassword('')
                                    setNewPassword('')
                                    setNewPasswordConfirm('')
                                }
                            }}
                            disabled={isLoading}
                            size="lg"
                            className="w-full sm:w-auto"
                            icon={isLoading ? null : '🔐'}
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-primary-600/30 border-t-primary-600 rounded-full animate-spin mr-2" />
                                    Изменение…
                                </>
                            ) : (
                                'Изменить пароль'
                            )}
                        </ResponsiveButton>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function TelegramTab({ profile }: { profile: ClientProfile | null }) {
    const [telegramData, setTelegramData] = useState<{
        telegram_chat_id: string | null;
        telegram: string | null;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadTelegramData();
    }, [profile]);

    async function loadTelegramData() {
        try {
            const res = await fetch('/api/profile');
            const data = await res.json();
            if (res.ok && data) {
                setTelegramData({
                    telegram_chat_id: data.telegram_chat_id || null,
                    telegram: data.telegram || null,
                });
            }
        } catch (error) {
            console.error('Error loading Telegram data:', error);
        } finally {
            setIsLoading(false);
        }
    }

    if (isLoading) {
        return (
            <Card className="booking-card border-2 p-4 md:p-6">
                <CardContent className="p-8 md:p-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    <p className="mt-3 md:mt-4 text-sm md:text-base text-gray-600">Загрузка Telegram настроек...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <TelegramConnect
            telegramChatId={telegramData?.telegram_chat_id || null}
            telegramUsername={telegramData?.telegram || null}
            onUpdate={loadTelegramData}
        />
    );
}

function BookingHistoryItem({ booking }: { booking: Booking }) {
    return (
        <div className="booking-card border-2 hover:shadow-xl transition-all duration-300 p-3 md:p-4">
            <div className="space-y-3 md:space-y-4">
                {/* Шапка с датой и статусом */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${booking.status === 'cancelled'
                            ? 'bg-gradient-to-br from-gray-400 to-gray-600'
                            : 'bg-gradient-to-br from-primary-400 to-primary-600'
                        }`}>
                            <Calendar className="h-4 w-4 md:h-5 md:w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-base md:text-lg font-bold text-gray-900 truncate">
                                {formatDateRu(booking.booking_date)}
                            </div>
                            <div className="text-xs md:text-sm text-gray-600 font-semibold truncate">
                                🕐 {booking.booking_time}
                            </div>
                        </div>
                    </div>
                    <div className="self-start md:self-center">
                        <StatusBadge status={booking.status} />
                    </div>
                </div>

                {/* Информация о записи */}
                <div className="grid grid-cols-2 md:grid-cols-2 gap-2 md:gap-3 py-2 md:py-3 border-t border-b border-gray-100">
                    <div className="flex items-center gap-1 md:gap-2 min-w-0">
                        <span className="text-xs md:text-sm text-gray-600 flex-shrink-0">Сумма:</span>
                        <span className="text-sm md:text-base font-bold text-gray-900 truncate">{booking.amount?.toLocaleString('ru-RU')} ₽</span>
                    </div>
                    {booking.notes && (
                        <div className="col-span-2 flex items-start gap-1 md:gap-2 min-w-0">
                            <span className="text-xs md:text-sm text-gray-600 flex-shrink-0">Примечание:</span>
                            <span className="text-xs md:text-sm text-gray-800 truncate">{booking.notes}</span>
                        </div>
                    )}
                </div>

                {/* Действия */}
                <div className="flex flex-wrap gap-2">
                    {(booking.status === 'confirmed' || booking.status === 'pending_payment') && (
                        <BookingActions booking={booking} />
                    )}
                </div>
            </div>
        </div>
    )
}