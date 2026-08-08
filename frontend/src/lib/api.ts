import { useAuth } from "@/hooks/use-auth";
import axios from "axios";
import { queryClient } from "./query-client";
import { queryKeys } from "@/queries";
export const api = axios.create({
  baseURL: import.meta.env.VITE_ROOT_API,
  timeout: 15000,
});

let refreshPromise: Promise<string> | null = null;

export const getOrRefreshToken = (): Promise<string> =>{
  if(!refreshPromise){
    refreshPromise = refreshAccessToken().finally(()=>{
      refreshPromise = null
    })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (resp) => resp.data,
  async (error) => {
    const original = error.config;
    if(original?.url.includes("/auth/refresh")){
      return Promise.reject(error)
    }

    const hadToken = !!useAuth.getState().accessToken

    if (error.response?.status === 401 && !original._retry && hadToken) {
      original._retry = true;
      try {
        const access_token = await getOrRefreshToken();
        useAuth.getState().setToken(access_token);
        original.headers.Authorization = `Bearer ${access_token}`;
        return api(original);
      } catch {
        useAuth.getState().logout();
        queryClient.removeQueries({ queryKey: queryKeys.auth.me });
        queryClient.removeQueries({ queryKey: queryKeys.notes.all });
      }
    }
    return Promise.reject(error);
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
  // The interceptor awaits this with NO overall deadline, and the axios
  // instance timeout does NOT apply here (bare axios.get). A hanging refresh
  // (server restart mid-request, network blackhole) would leave every retried
  // request — including POST /groups — pending forever: no toast, no error,
  // "creating a group silently doesn't work". Bound it so the 401-retry chain
  // rejects fast and onError fires.
  const resp = await axios.get(
    `${import.meta.env.VITE_ROOT_API}/auth/refresh`,
    { withCredentials: true, timeout: 10_000 },
  );
  const data = resp.data.data;
  return data.access_token;
};