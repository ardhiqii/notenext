import { useModal } from "@/hooks/use-modal"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"



const ConnectionNoteModal = () =>{
  const {isOpen, type} = useModal()
  const isModalOpen = isOpen && type === 'connection-note'
  return (
    <Dialog open={isModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connecting...</DialogTitle>
          <DialogDescription>
            Currently connection to server.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

export default ConnectionNoteModal