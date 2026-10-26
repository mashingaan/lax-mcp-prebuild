/** Free jobs and legacy work submissions, independent of tender bidding and PACT. */
export type JobTrack = 'lax-agents' | 'coding-agents' | 'godman-protocols' | 'templates' | 'genesis-tools' | 'seat'
export interface Job {
  id: string
  title: string
  track: JobTrack
  summary: string
  spec_md: string
  spec_url?: string | null
  tests_url?: string | null
  skills: string[]
  bounty_usdc: number
  currency: 'USDC'
  chain: 'base'
  deadline: string
  status: 'open' | 'assigned' | 'review' | 'accepted' | 'paid' | 'closed'
  created_by: string
  created_at: string
  updated_at?: string | null
  bid_closes?: string | null
  selection?: Record<string, unknown> | null
  seat?: { sprint_id: string, task_id: string, role: 'coder' | 'worker' | 'tester', window_closes: string } | null
}
export interface JobsList { jobs: Job[], count: number }
export interface JobsFilter { track?: string, limit?: number, offset?: number }
export interface JobSubmissionInput {
  builder: string
  contact: string
  repo_or_patch_url: string
  payout_address: string
  agent_did: string
  notes?: string
}
export interface JobSubmission { id: string, job_id: string, status: string, created_at: string }
export type LaxJobsErrorCode = 'invalid_input' | 'bad_request' | 'not_found' | 'conflict' | 'rate_limited' | 'server' | 'network' | 'invalid_response'
export class LaxJobsError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: LaxJobsErrorCode) {
    super(message)
    this.name = 'LaxJobsError'
  }
}
export interface JobsClientOptions {
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  retries?: number
  sleep?: (ms: number) => Promise<unknown>
  timeoutMs?: number
}
export interface JobsClient {
  listJobs(filter?: JobsFilter): Promise<JobsList>
  getJob(id: string): Promise<Job>
  submit(jobId: string, input: JobSubmissionInput): Promise<JobSubmission>
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const invalid = (message: string): never => { throw new LaxJobsError(message, 0, 'invalid_input') }
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const codeFor = (status: number): LaxJobsErrorCode => status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 429 ? 'rate_limited' : status >= 500 ? 'server' : 'bad_request'

export function createJobsClient(options: JobsClientOptions = {}): JobsClient {
  const base = (options.baseUrl ?? 'https://lax.kognai.ai/registry').replace(/\/+$/, '')
  try {
    const url = new URL(base)
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) invalid('baseUrl must be an HTTP URL without query or fragment')
  } catch { invalid('baseUrl must be an HTTP URL without query or fragment') }
  const fetcher = options.fetch ?? globalThis.fetch
  if (typeof fetcher !== 'function') invalid('fetch is required')
  const retries = options.retries ?? 2
  const timeout = options.timeoutMs ?? 15000
  if (!Number.isSafeInteger(retries) || retries < 0) invalid('retries must be a nonnegative integer')
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2147483647) invalid('timeoutMs must be a positive timer duration')
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const idPath = (id: string) => {
    if (!nonempty(id)) invalid('job id must be a nonempty string')
    try { return `/jobs/${encodeURIComponent(id)}` } catch { return invalid('job id cannot be URL encoded') }
  }

  async function attempt(path: string, body?: string): Promise<{ response: Response, data: unknown }> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let received: Response | undefined
    const expired = new Promise<{ response: Response, data: unknown }>((resolve, reject) => {
      timer = setTimeout(() => {
        // Receiving an error status already determines its retry policy, even
        // when its body stalls. Do not turn a received 400 into a network retry.
        if (received && !received.ok) resolve({response:received,data:undefined})
        else reject(new LaxJobsError('Request timed out', received?.status ?? 0, 'network'))
        controller.abort()
      }, timeout)
    })
    try {
      return await Promise.race([expired, (async () => {
        let response: Response
        try {
          response = await fetcher(`${base}${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            ...(body === undefined ? {} : { body, headers: { 'content-type': 'application/json' } }),
            signal: controller.signal
          })
          received = response
        } catch { throw new LaxJobsError('Network request failed', 0, 'network') }
        let data: unknown
        try { data = await response.json() } catch {
          if (response.ok) throw new LaxJobsError('Registry returned invalid JSON', response.status, 'invalid_response')
        }
        return { response, data }
      })()])
    } finally { if (timer !== undefined) clearTimeout(timer) }
  }

  async function request(path: string, body?: string): Promise<{ data: unknown, status: number }> {
    let index = 0
    while (true) {
      let result: { response: Response, data: unknown }
      try { result = await attempt(path, body) } catch (error) {
        if (error instanceof LaxJobsError && error.code === 'network' && body === undefined && index < retries) {
          await sleep(500 * 2 ** index++)
          continue
        }
        throw error
      }
      const { response, data } = result
      if (response.ok) return { data, status: response.status }
      const canRetry = response.status === 429 || (body === undefined && response.status >= 500 && response.status <= 599)
      if (canRetry && index < retries) {
        const retryAfter = response.headers.get('Retry-After')
        const seconds = retryAfter !== null && /^\s*\d+(?:\.\d+)?\s*$/.test(retryAfter) ? Number(retryAfter) : NaN
        await sleep(Number.isFinite(seconds) ? Math.min(30000, seconds * 1000) : 500 * 2 ** index)
        index++
        continue
      }
      throw new LaxJobsError(record(data) && typeof data.error === 'string' ? data.error : `Registry HTTP ${response.status}`, response.status, codeFor(response.status))
    }
  }
  const badResponse = (status: number): never => { throw new LaxJobsError('Registry returned an invalid response envelope', status, 'invalid_response') }
  return {
    async listJobs(filter: JobsFilter = {}) {
      if (!record(filter)) invalid('filter must be an object')
      const query = new URLSearchParams()
      if (filter.track !== undefined) {
        if (typeof filter.track !== 'string') invalid('track must be a string')
        query.set('track', filter.track)
      }
      if (filter.limit !== undefined) {
        if (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 100) invalid('limit must be 1 to 100')
        query.set('limit', String(filter.limit))
      }
      if (filter.offset !== undefined) {
        if (!Number.isSafeInteger(filter.offset) || filter.offset < 0) invalid('offset must be a nonnegative integer')
        query.set('offset', String(filter.offset))
      }
      const { data, status } = await request(`/jobs${query.size ? `?${query}` : ''}`)
      if (!record(data) || !Array.isArray(data.jobs) || !data.jobs.every(record) || typeof data.count !== 'number' || !Number.isSafeInteger(data.count) || data.count < 0) return badResponse(status)
      return data as unknown as JobsList
    },
    async getJob(id) {
      const { data, status } = await request(idPath(id))
      if (!record(data) || !record(data.job)) return badResponse(status)
      return data.job as unknown as Job
    },
    async submit(jobId, input) {
      const path = `${idPath(jobId)}/submissions`
      if (!record(input) || !nonempty(input.agent_did) || !/^did:[a-z0-9]+:\S+$/.test(input.agent_did)) invalid('agent_did must be a DID')
      if (typeof input.payout_address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(input.payout_address)) invalid('payout_address must be a Base address')
      try {
        if (typeof input.repo_or_patch_url !== 'string' || new URL(input.repo_or_patch_url).protocol !== 'https:') invalid('repo_or_patch_url must be https')
      } catch { invalid('repo_or_patch_url must be https') }
      if (!nonempty(input.builder) || !nonempty(input.contact)) invalid('builder and contact are required')
      if (input.notes !== undefined && typeof input.notes !== 'string') invalid('notes must be a string')
      const body = JSON.stringify({ builder: input.builder, contact: input.contact, repo_or_patch_url: input.repo_or_patch_url, payout_address: input.payout_address, agent_did: input.agent_did, ...(input.notes === undefined ? {} : { notes: input.notes }) })
      const { data, status } = await request(path, body)
      if (!record(data) || !record(data.submission) || !['id', 'job_id', 'status', 'created_at'].every(key => typeof data.submission === 'object' && data.submission !== null && typeof (data.submission as Record<string, unknown>)[key] === 'string')) return badResponse(status)
      return data.submission as unknown as JobSubmission
    }
  }
}

