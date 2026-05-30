import axios, {AxiosError} from 'axios';

/** General REST client (not the CMS). CMS HTTP base is `getCmsHttpOrigin()` in `src/config/cmsEndpoints.ts`. */
const BASE_URL = process.env.HOTEL_API_BASE_URL ?? 'https://example-hotel-api.local';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
});

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    return Promise.reject(error);
  },
);

export async function withRetry<T>(request: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-plusplus
      attempt++;
      return await request();
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      const delay = 500 * 2 ** (attempt - 1);
      await new Promise(resolve => {
        setTimeout(resolve, delay);
      });
    }
  }
}

