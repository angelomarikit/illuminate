import type { ReactNode } from 'react'

type PageHeaderProps = {
  kicker?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ kicker, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {kicker ? <div className="page-kicker">{kicker}</div> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}
