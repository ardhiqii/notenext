import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const TabsBar = () => {
  const TABS = ["new 1", "new 2", "new 3", "new 4"];
  return (
    <div className="w-full border-b-2 border-t-2 flex">
      {TABS.map((tab, idx) => (
        <div
          key={idx}
          className={cn(
            "pl-3 pr-1 py-1 border-r cursor-pointer group hover:bg-zinc-900 flex items-center  ",
            idx === 0 && "border-t-orange-600 border-t-2 -mt-0.5 bg-zinc-900 "
          )}
        >
          <p className="text-sm font-thin">{tab}</p>
          <X
            className={cn(
              "opacity-0 w-3 h-3 ml-2 group-hover:opacity-100 mt-0.5",
              idx === 0 && "opacity-100"
            )}
          />
        </div>
      ))}
    </div>
  );
};

export default TabsBar;
