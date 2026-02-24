import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute('/')({
  loader: () =>{
    console.log("### INDEX.tsx LOADER ###");
    throw redirect({
      to:'/n/$noteId',
      params:{noteId: '123'}
    })
  }
})