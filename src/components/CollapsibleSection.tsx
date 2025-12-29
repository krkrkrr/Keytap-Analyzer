import { useState, type ReactNode } from 'react'
import styles from './CollapsibleSection.module.css'

interface CollapsibleSectionProps {
  title: string
  defaultExpanded?: boolean
  children: ReactNode
}

export function CollapsibleSection({ title, defaultExpanded = true, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={styles.container}>
      <button
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className={styles.icon}>{isExpanded ? '▼' : '▶'}</span>
        <h3 className={styles.title}>{title}</h3>
      </button>
      {isExpanded && <div className={styles.content}>{children}</div>}
    </div>
  )
}
