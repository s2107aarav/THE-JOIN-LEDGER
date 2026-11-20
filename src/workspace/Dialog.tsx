import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

export function Dialog({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useRef('workspace-dialog-title')

  useEffect(() => {
    const dialog = ref.current
    const trigger = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  return <dialog ref={ref} aria-labelledby={id.current} className={className} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="dialog-heading">
      <h2 id={id.current}>{title}</h2>
      <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" size={20} /></button>
    </header>
    {children}
  </dialog>
}
