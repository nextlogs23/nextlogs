export type ProviderResult={providerReference:string;status:'processing'|'successful'|'failed';rawStatus:string;token?:string};
export interface SmsProvider { listServices(country:string):Promise<Array<{id:string;name:string;costMinor:number}>>; purchase(input:{country:string;service:string;reference:string}):Promise<{providerReference:string;number:string;expiresAt:string}>; status(providerReference:string):Promise<{status:'waiting'|'received'|'completed'|'expired'|'cancelled';messages:Array<{receivedAt:string;text:string}>}> }
export interface VtuProvider { dataPlans(network:string):Promise<Array<{id:string;name:string;costMinor:number}>>; validateMeter(input:{provider:string;meterType:string;meterNumber:string}):Promise<{customerName:string;address?:string}>; purchase(input:{type:'airtime'|'data'|'electricity';reference:string;phone?:string;network?:string;planId?:string;provider?:string;meterType?:string;meterNumber?:string;amountMinor:number}):Promise<ProviderResult> }

class UnconfiguredSms implements SmsProvider {private fail():never{throw Object.assign(new Error('SMS verification provider is not configured'),{status:503})}async listServices():Promise<never>{return this.fail()}async purchase():Promise<never>{return this.fail()}async status():Promise<never>{return this.fail()}}
class UnconfiguredVtu implements VtuProvider {private fail():never{throw Object.assign(new Error('VTU provider is not configured'),{status:503})}async dataPlans():Promise<never>{return this.fail()}async validateMeter():Promise<never>{return this.fail()}async purchase():Promise<never>{return this.fail()}}

export function smsProvider():SmsProvider{return new UnconfiguredSms()}
export function vtuProvider():VtuProvider{return new UnconfiguredVtu()}
// Add a provider adapter implementing the interfaces above. Never return mock
// success from production. Raw payloads should be reduced to the typed result.
