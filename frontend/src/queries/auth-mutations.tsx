import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useAuth } from "@/hooks/use-auth";

function logout(){
  return useMutation({
    mutationFn: async () =>{
      await api.post("/auth/logout")
      return
    },
    onSuccess: (_data,_vars,_onMutateResult, ctx)=>{
      useAuth.getState().logout()
      ctx.client.removeQueries({queryKey:queryKeys.notes.all})
      
    }
  })
}

export const AuthMutations = {
  logout
}