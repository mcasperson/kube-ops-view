const PIXI = require('pixi.js')

const FACTORS = {
    'n': 1 / 1000000000,
    'u': 1 / 1000000,
    'm': 1 / 1000,
    '': 1,
    'k': 1000,
    'M': Math.pow(1000, 2),
    'G': Math.pow(1000, 3),
    'T': Math.pow(1000, 4),
    'P': Math.pow(1000, 5),
    'E': Math.pow(1000, 6),
    'Ki': 1024,
    'Mi': Math.pow(1024, 2),
    'Gi': Math.pow(1024, 3),
    'Ti': Math.pow(1024, 4),
    'Pi': Math.pow(1024, 5),
    'Ei': Math.pow(1024, 6)
}

function hsvToRgb(h, s, v) {
    let r, g, b
    const i = Math.floor(h * 6)
    const f = h * 6 - i
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)
    switch (i % 6) {
    case 0:
        r = v
        g = t
        b = p
        break
    case 1:
        r = q
        g = v
        b = p
        break
    case 2:
        r = p
        g = v
        b = t
        break
    case 3:
        r = p
        g = q
        b = v
        break
    case 4:
        r = t
        g = p
        b = v
        break
    case 5:
        r = v
        g = p
        b = q
        break
    }
    return PIXI.utils.rgb2hex([r, g, b])
}

function getBarColor(usage, capacity) {
    return hsvToRgb(Math.max(0, Math.min(1, 0.4 - (0.4 * (usage / capacity)))), 0.6, 1)
}

function parseResource(v) {
    const match = v.match(/^(\d*)(\D*)$/)
    const factor = FACTORS[match[2]] || 1
    return parseInt(match[1]) * factor
}

function copyStringToClipboard (str) {
    // Create new element
    const el = document.createElement('textarea')
    // Set value (string to be copied)
    el.value = str
    // Set non-editable to avoid focus and move outside of view
    el.setAttribute('readonly', '')
    el.style = {position: 'absolute', left: '-9999px'}
    document.body.appendChild(el)
    // Select text inside element
    el.select()
    // Copy text to clipboard
    document.execCommand('copy')
    // Remove temporary element
    document.body.removeChild(el)
}

const metric = (metric, type) =>
    metric ? (metric[type] ? parseResource(metric[type]) : 0) : 0

const podResource = type => (containers, resource) =>
    containers
        .map(({resources}) => resources ? metric(resources[resource], type) : 0)
        .reduce((a, b) => a + b, 0)

export function hashCode(input) {
    let hash = 0
    if (input == 0) return hash
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i)
        hash = ((hash<<5)-hash)+char
        hash = hash & hash // Convert to 32bit integer
    }
    return hash
}


export function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h
    }
    i = Math.floor(h * 6)
    f = h * 6 - i
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    switch (i % 6) {
    case 0:
        r = v, g = t, b = p
        break
    case 1:
        r = q, g = v, b = p
        break
    case 2:
        r = p, g = v, b = t
        break
    case 3:
        r = p, g = q, b = v
        break
    case 4:
        r = t, g = p, b = v
        break
    case 5:
        r = v, g = p, b = q
        break
    }

    return [r, g, b]
}

export {FACTORS, hsvToRgb, getBarColor, parseResource, metric, podResource, copyStringToClipboard}
