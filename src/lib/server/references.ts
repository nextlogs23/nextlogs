import { randomUUID } from "crypto";
export const reference=(prefix='NVR')=>`${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,8).toUpperCase()}`;
