import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"./tests/remote",testMatch:"profiles-talent.spec.mjs",timeout:240000,expect:{timeout:15000},workers:1,retries:0,use:{baseURL:process.env.FILMATTA_PREVIEW_URL,channel:"chrome",headless:true,actionTimeout:15000,navigationTimeout:30000,trace:"off",video:"off"}});
