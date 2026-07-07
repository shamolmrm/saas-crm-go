'use client'

import { redirect } from 'next/navigation'

// Sub-routes (sales, revenue, forecast, ai) all redirect to main analytics
// The main analytics page handles all views in one unified dashboard
export default function AnalyticsSubPage() {
  redirect('/analytics')
}
