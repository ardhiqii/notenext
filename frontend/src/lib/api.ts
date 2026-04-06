import { useAuth } from "@/hooks/use-auth";
import axios from "axios";
import { queryClient } from "./query-client";
import { queryKeys } from "@/queries";
export const api = axios.create({
  baseURL: import.meta.env.VITE_ROOT_API,
  timeout: 15000,
});

api.interceptors.response.use(
  (resp) => resp.data,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        console.log("API RESPONSE");
        const access_token =  await refreshAccessToken()
        useAuth.getState().setToken(access_token);
        original.headers.Authorization = `Bearer ${access_token}`
        return api(original)

      } catch {
        useAuth.getState().clearToken();
        queryClient.removeQueries({ queryKey: queryKeys.auth.me });
      }
    }
  },
);

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


export const refreshAccessToken = async () => {
  console.log("GET CALLED");
  const resp = await axios.get(
    `${import.meta.env.VITE_ROOT_API}/auth/refresh`,
    { withCredentials: true } 
  );
  const data = resp.data.data
  return data.access_token
};
