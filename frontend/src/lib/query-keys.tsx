export const queryKeys = {
  notes:{
    all: ["notes"],
    tabs: ["tabs"],
    noteById: (id:string) =>  [...queryKeys.notes.all,id ]
  }
}