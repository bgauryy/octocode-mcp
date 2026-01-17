#!/usr/bin/env node
import { Express } from "express";

//#region src/server.d.ts
declare function createServer(): Promise<Express>;
declare function startServer(): Promise<void>;
//#endregion
export { createServer, startServer };