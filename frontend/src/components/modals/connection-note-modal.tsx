import { useModal } from "@/hooks/use-modal"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"



const ConnectionNoteModal = () =>{
  const {isOpen, type, closeModal} = useModal()
  const isModalOpen = isOpen && type === 'connection-note'
  return (
    // onOpenChange lets Escape / overlay-click dismiss the modal. The editor
    // closes it on WS sync, but if the WS never syncs (hub restart, dead
    // ticket) the app must not be locked behind a permanently-open dialog.
    <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
      <DialogContent showCloseButton={false} className="outline-0">
        <DialogHeader>
          <DialogTitle>Connecting...</DialogTitle>
          <DialogDescription>
            Currently connecting to server.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

export default ConnectionNoteModal