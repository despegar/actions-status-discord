import { endGroup, startGroup } from '@actions/core'
import * as github from '@actions/github'
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { formatEvent } from './format'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { getInputs, Inputs, statusOpts } from './input'
import { logDebug, logError, logInfo } from './utils'
import { fitEmbed } from './validate'

async function run() {
    try {
        logInfo('Getting inputs...')
        const inputs = getInputs()

        logInfo('Generating payload...')
        const payload = getPayload(inputs)
        startGroup('Dump payload')
            logInfo(JSON.stringify(payload, null, 2))
        endGroup()
        startGroup('Proxy config')
            logInfo(`http_proxy -> ${process.env['http_proxy'] || process.env['HTTP_PROXY'] || 'no http proxy setted'}`)
            logInfo(`https_proxy -> ${process.env['https_proxy'] || process.env['HTTPS_PROXY'] || 'no https proxy setted'}`)
        endGroup()

        logInfo(`Triggering ${inputs.webhooks.length} webhook${inputs.webhooks.length>1 ? 's' : ''}...`)
        await Promise.all(inputs.webhooks.map(w => wrapWebhook(w.trim(), payload)))
    } catch(e: any) {
        logError(`Unexpected failure: ${e} (${e.message})`)
    }
}

function wrapWebhook(webhook: string, payload: Object): Promise<void> {
    return async function() {
        try {
            const fullProxy = process.env['http_proxy'] || process.env['HTTP_PROXY'] || process.env['https_proxy'] || process.env['HTTPS_PROXY']
            const host = fullProxy ? fullProxy.split(':')[0] : ''
            const port = fullProxy ? parseInt(fullProxy.split(':')[1]) : ''
            let proxy: any = host && port ? { proxy: { host, port }} : null
            if(proxy) {
                const agent = new HttpsProxyAgent({host, port, rejectUnauthorized: false})
                proxy = {...proxy, httpAgent: agent, httpsAgent: agent}
            }
            const client = axios.create({...proxy, maxRedirects: 0, timeout: 0, })
            client.interceptors.request.use( (config: AxiosRequestConfig) => {
                logInfo(JSON.stringify(config))
                return config
            })
            client.interceptors.response.use((axiosResponse: AxiosResponse) => {
                logInfo(JSON.stringify(axiosResponse))
                return axiosResponse
            }, (error: AxiosError) => {
                logInfo(JSON.stringify(error))
                return error
            })
            await client.post(webhook, payload)
        } catch(e: any) {
            if (e.response) {
                logError(`Webhook response: ${e.response.status}: ${JSON.stringify(e.response.data)}`)
            } else {
                logError(e)
            }
        }
    }()
}

export function getPayload(inputs: Readonly<Inputs>): Object {
    const ctx = github.context
    const { owner, repo } = ctx.repo
    const { eventName, sha, ref, workflow, actor, payload } = ctx
    const repoURL = `https://github.com/${owner}/${repo}`
    // if the trigger is pull_request, check `github.event.pull_request.head.sha` first.
    // see issues/132
    const validSHA = ctx.payload.pull_request?.head?.sha || sha
    const workflowURL = `${repoURL}/commit/${validSHA}/checks`

    logDebug(JSON.stringify(payload))

    const eventFieldTitle = `Event - ${eventName}`
    const eventDetail = formatEvent(eventName, payload)

    let embed: {[key: string]: any} = {
        color: inputs.color || statusOpts[inputs.status].color,
        timestamp: (new Date()).toISOString()
    }

    // title
    if (inputs.title) {
        embed.title = inputs.title
    }

    if (inputs.image) {
        embed.image = {
            url: inputs.image
        }
    }

    if (!inputs.noprefix) {
        embed.title = statusOpts[inputs.status].status + (embed.title ? `: ${embed.title}` : '')
    }

    if (inputs.description) {
        embed.description = inputs.description
    }

    if (!inputs.nocontext) {
        embed.fields = [
            {
                name: 'Repository',
                value: `[${owner}/${repo}](${repoURL})`,
                inline: true
            },
            {
                name: 'Ref',
                value: ref,
                inline: true
            },
            {
                name: eventFieldTitle,
                value: eventDetail,
                inline: false
            },
            {
                name: 'Triggered by',
                value: actor,
                inline: true
            },
            {
                name: 'Workflow',
                value: `[${workflow}](${workflowURL})`,
                inline: true
            }
        ]
    }

    let discord_payload: any = {
        embeds: [fitEmbed(embed)]
    }
    logDebug(`embed: ${JSON.stringify(embed)}`)

    if (inputs.username) {
        discord_payload.username = inputs.username
    }
    if (inputs.avatar_url) {
        discord_payload.avatar_url = inputs.avatar_url
    }

    return discord_payload
}

run()
