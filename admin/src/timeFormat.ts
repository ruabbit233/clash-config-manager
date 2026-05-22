import { t } from './i18n'

export const formatRelativeTime = (date: Date, now: Date = new Date()): string => {
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return t.versions.timeNow
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return t.versions.timeMinutesAgo({ n: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t.versions.timeHoursAgo({ n: diffHour })
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return t.versions.timeDaysAgo({ n: diffDay })
  return date.toLocaleDateString('zh-CN')
}

export const formatAbsoluteTime = (date: Date): string => date.toLocaleString('zh-CN')
