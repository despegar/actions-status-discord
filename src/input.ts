import * as core from '@actions/core'
import { env } from 'process'
import { asNumber, logWarning, stob } from './utils'

export interface Inputs {
    webhooks: string[]
    status:string
    description: string
    title: string
    image: string
    color: number
    username: string
    avatar_url: string
    nocontext: boolean
    noprefix: boolean
}

interface StatusOption {
    status: string
    color: number
}

export const statusOpts: Record<string, StatusOption> = {
    success: {
        status: 'Success',
        color: 0x28A745
    },
    failure: {
        status: 'Failure',
        color: 0xCB2431
    },
    cancelled: {
        status: 'Cancelled',
        color: 0xDBAB09
    }
}

export function getInputs(): Inputs {
    // webhook
    const webhook: string = core.getInput('webhook', { required: true, trimWhitespace: true}) || process.env.DISCORD_WEBHOOK || ''
    const webhooks: string[] = webhook.split('\n').filter(x => x || false)
    // prevent webhooks from leak
    webhooks.forEach((w, i) => {
        core.setSecret(w)
        // if webhook has `/github` suffix, warn them (do not auto-fix)
        if (w.endsWith('/github')) {
            logWarning(`webhook ${i+1}/${webhooks.length} has \`/github\` suffix! This may cause errors.`)
        }
    })

    // nodetail -> nocontext, noprefix
    const nodetail = stob(core.getInput('nodetail'))
    const nocontext = nodetail || stob(core.getInput('nocontext'))
    const noprefix = nodetail || stob(core.getInput('noprefix'))

    // retrieve proxy config
    const proxyHost = core.getInput('proxyHost', { required: false, trimWhitespace: true })
    const proxyPort = asNumber(core.getInput('proxyPort', { required: false, trimWhitespace: true }))

    if(proxyHost && proxyPort) {
        delete process.env['http_proxy']
        delete process.env['https_proxy']
        delete process.env['HTTP_PROXY']
        delete process.env['HTTPS_PROXY']
        const proxy = `http://${proxyHost}:${proxyPort}`
        process.env['http_proxy'] = proxy
        process.env['https_proxy'] = proxy
        process.env['HTTP_PROXY'] = proxy
        process.env['HTTPS_PROXY'] = proxy
    }

    const inputs: Inputs =  {
        webhooks: webhooks,
        status: core.getInput('status', { trimWhitespace: true }).toLowerCase(),
        description: core.getInput('description',  { trimWhitespace: true }),
        title: (core.getInput('title') || core.getInput('job', { trimWhitespace: true })),
        image: core.getInput('image', { trimWhitespace: true }),
        color: parseInt(core.getInput('color')),
        username: core.getInput('username', { trimWhitespace: true }),
        avatar_url: core.getInput('avatar_url', { trimWhitespace: true }),
        nocontext: nocontext,
        noprefix: noprefix
    }

    // validate
    if (!inputs.webhooks.length) {
        throw new Error("no webhook is given")
    }
    if (!(inputs.status in statusOpts)) {
        throw new Error(`invalid status value: ${inputs.status}`)
    }

    return inputs
}
