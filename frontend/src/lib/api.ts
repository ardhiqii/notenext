import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_ROOT_API,
  timeout: 15000,
});

api.interceptors.response.use(
  (resp) => resp.data,
  (error) => Promise.reject(error)
);
