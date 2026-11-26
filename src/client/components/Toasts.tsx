/** Transient notifications and the import-job dock. */
import * as React from 'react'
import type { ImportJob } from '../types'
import { JOB_STATE_LABEL } from '../types'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons'

export interface ToastItem {
  id: string
  kind: 'info' | 'success' | 'error'
  message: string
}

export interface ToastsProps {
  toasts: ToastItem[]
  jobs: ImportJob[]
  onDismissToast: (id: string) => void
  onDismissJob: (id: string) => void
}

export function Toasts({ toasts, jobs, onDismissToast, onDismissJob }: ToastsProps) {
  return (
    <div className="lg-toast-stack" aria-live="polite">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} onDismiss={() => onDismissJob(job.id)} />
      ))}
      {toasts.map((toast) => (
        <div key={toast.id} className="lg-toast" data-kind={toast.kind} role="status">
          <span className="lg-toast-icon">
            {toast.kind === 'success' ? <CheckIcon size={13} /> : toast.kind === 'error' ? <AlertIcon size={13} /> : <InfoIcon size={13} />}
          </span>
          <span className="lg-toast-text">{toast.message}</span>
          <button type="button" className="lg-toast-close" aria-label="关闭提示" onClick={() => onDismissToast(toast.id)}>
            <CloseIcon size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}

function JobCard({ job, onDismiss }: { job: ImportJob; onDismiss: () => void }) {
  const done = job.state === 'done' || job.state === 'failed'
  const percent = Math.max(0, Math.min(100, Math.round(job.progress)))
  return (
    <div className="lg-job" data-state={job.state} data-job-id={job.id}>
      <div className="lg-job-head">
        <span className="lg-job-title">{JOB_STATE_LABEL[job.state] || job.state}</span>
        <span className="lg-job-value">{percent}%</span>
        {done ? (
          <button type="button" className="lg-toast-close" aria-label="关闭" onClick={onDismiss}>
            <CloseIcon size={10} />
          </button>
        ) : null}
      </div>
      <div className="lg-job-message">{job.message || (job.state === 'done' ? '已完成' : '处理中…')}</div>
      <div className="lg-job-track">
        <div className="lg-job-bar" style={{ width: Math.max(4, percent) + '%' }} />
      </div>
    </div>
  )
}
