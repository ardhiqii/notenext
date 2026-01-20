import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {RefreshCw } from 'lucide-react';
import { useState } from "react";

const SyncIndicator = () => {
  const [sync,setSync] = useState(false)
  const [conflict,_] = useState(false)

  const getSyncMessage = () => {
    switch (true) {
      case conflict:
        return "Conflict detected"
      case sync:
        return "Synchronizing..."
      default:
        return "Synchronized"
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("block bg-zinc-500 w-2 h-2 rounded-full mr-1",
        conflict && "bg-orange-400",
          sync && "bg-green-400 animate-pulse"
        )}></div>
      </TooltipTrigger>
      <TooltipContent className=" text-center  flex items-center gap-x-2" arrowClassName="">
        <p className="font-thin">
          {getSyncMessage()}
        </p>
        <RefreshCw className={cn(
          "w-4 cursor-pointer",
          sync && 'animate-spin'
        )} strokeWidth={1} onClick={()=>setSync(true)}/>
      </TooltipContent>
    </Tooltip>
  );
}

export default SyncIndicator;