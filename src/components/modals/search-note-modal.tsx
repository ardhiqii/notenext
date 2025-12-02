import { Command, CommandDialog, CommandInput, CommandItem } from "../ui/command";

const SearchNoteModal = () => {
  return (
    <CommandDialog>
      <CommandInput placeholder="Type name file" />
      <CommandItem>
        <p>TEST</p>
      </CommandItem>
    </CommandDialog>
  );
};

export default SearchNoteModal;
