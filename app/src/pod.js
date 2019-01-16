import {MENU_HORIZONTAL_PADDING} from './menu'
import App from './app.js'
import {FACTORS, getBarColor, podResource} from './utils.js'
import {BRIGHTNESS_FILTER} from './filters.js'
import {hashCode, hsvToRgb, HSVtoRGB} from './utils'

const PIXI = require('pixi.js')
const {
    compareSemVer,
    isValidSemVer,
    parseSemVer,
    parseVersionPart,
} = require('semver-parser')

const ALL_PODS = {}

const MAX_HUE = 1 / 3.5
const EMPTY_METADATA_VALUE_COLOR = 0xff00ee
const UNDEFINED_METADATA_VALUE_COLOR = 0xC0C0C0

const sortByName = (a, b) => {
    // https://github.com/hjacobs/kube-ops-view/issues/103
    // *.name might be undefined
    return (a.name || '').localeCompare(b.name || '')
}

const sortByAge = (a, b) => {
    const dateA = new Date(a.startTime)
    const dateB = new Date(b.startTime)
    if (dateA.getTime() < dateB.getTime()) {
        return -1
    } else if (dateA.getTime() === dateB.getTime())
        return 0
    else
        return 1
}

const sortByMemory = (a, b) => {
    const aMem = podResource('memory')(a.containers, 'usage')
    const bMem = podResource('memory')(b.containers, 'usage')
    return bMem - aMem
}

const sortByCPU = (a, b) => {
    const aCpu = podResource('cpu')(a.containers, 'usage')
    const bCpu = podResource('cpu')(b.containers, 'usage')
    return bCpu - aCpu
}

export {ALL_PODS, sortByAge, sortByCPU, sortByMemory, sortByName}

export class Pod extends PIXI.Graphics {

    constructor(pod, cluster, tooltip, menu) {
        super()
        this.menu = menu
        this.pod = pod
        this.cluster = cluster
        this.tooltip = tooltip
        this.tick = null
        this._progress = 1
        this._targetPosition = null

        if (cluster) {
            ALL_PODS[cluster.cluster.id + '/' + pod.namespace + '/' + pod.name] = this
        }
    }

    destroy(options) {
        if (this.tick) {
            PIXI.ticker.shared.remove(this.tick, this)
        }
        PIXI.ticker.shared.remove(this.animateMove, this)
        this.clear()
        super.destroy(options)
        if (this.cluster) {
            delete ALL_PODS[this.cluster.cluster.id + '/' + this.pod.namespace + '/' + this.pod.name]
        }
    }

    animateMove(time) {
        const deltaX = this._targetPosition.x - this.position.x
        const deltaY = this._targetPosition.y - this.position.y
        if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) {
            this.position = this._targetPosition
            PIXI.ticker.shared.remove(this.animateMove, this)
        } else {
            if (Math.abs(deltaX) > time) {
                this.position.x += time * Math.sign(deltaX)
            }
            if (Math.abs(deltaY) > time) {
                this.position.y += time * Math.sign(deltaY)
            }
        }
    }

    movePodTo(targetPosition) {
        if (!this._targetPosition) {
            // just set coords
            this.position = this._targetPosition = targetPosition
        } else if (!this._targetPosition.equals(targetPosition)) {
            // animate moving to new position
            this._targetPosition = targetPosition
            PIXI.ticker.shared.add(this.animateMove, this)
        }
    }

    getResourceUsage() {

        const podCpu = podResource('cpu')
        const podMem = podResource('memory')

        const cpuLimits = podCpu(this.pod.containers, 'limits')
        const cpuUsage = podCpu(this.pod.containers, 'usage')
        const cpuRequests = podCpu(this.pod.containers, 'requests')

        const memLimits = podMem(this.pod.containers, 'limits')
        const memUsage = podMem(this.pod.containers, 'usage')
        const memRequests = podMem(this.pod.containers, 'requests')

        return {
            memory: {
                limit: memLimits,
                requested: memRequests,
                used: memUsage
            },
            cpu: {
                limit: cpuLimits,
                requested: cpuRequests,
                used: cpuUsage
            }
        }
    }

    static getOrCreate(pod, cluster, tooltip, menu) {
        const existingPod = ALL_PODS[cluster.cluster.id + '/' + pod.namespace + '/' + pod.name]
        if (existingPod) {
            existingPod.pod = pod
            existingPod.clear()
            return existingPod
        } else {
            return new Pod(pod, cluster, tooltip, menu)
        }
    }

    pulsate(_time) {
        const v = Math.sin((PIXI.ticker.shared.lastTime % 1000) / 1000. * Math.PI)
        this.alpha = v * this._progress
    }

    crashing(_time) {
        const v = Math.sin((PIXI.ticker.shared.lastTime % 1000) / 1000. * Math.PI)
        this.tint = PIXI.utils.rgb2hex([1, v, v])
    }

    terminating(_time) {
        const v = Math.sin(((1000 + PIXI.ticker.shared.lastTime) % 1000) / 1000. * Math.PI)
        this.cross.alpha = v
    }

    draw() {

        this.children.forEach(child => child.destroy(true))
        this.removeChildren()
        this.clear()

        let ready = 0
        let running = 0
        let restarts = 0
        for (const container of this.pod.containers) {
            if (container.ready) {
                ready++
            }
            if (container.state && container.state.running) {
                running++
            }
            restarts += container.restartCount || 0
        }
        const allReady = ready >= this.pod.containers.length
        const allRunning = running >= this.pod.containers.length
        const resources = this.getResourceUsage()

        const podBox = this
        podBox.interactive = true

        this.podMenu()

        podBox.on('mouseover', function () {
            podBox.filters = podBox.filters.filter(x => x != BRIGHTNESS_FILTER).concat([BRIGHTNESS_FILTER])
            let s = this.pod.name
            s += '\nNamespace  : ' + this.pod.namespace
            s += '\nStatus     : ' + this.pod.phase + ' (' + ready + '/' + this.pod.containers.length + ' ready)'
            s += '\nStart Time : ' + this.pod.startTime
            s += '\nLabels     :'
            for (var key of Object.keys(this.pod.labels).sort()) {
                if (key !== 'pod-template-hash') {
                    s += '\n  ' + key + ': ' + this.pod.labels[key]
                }
            }
            s += '\nAnnotations:'
            for (var annotation of Object.keys(this.pod.annotations).sort()) {
                s += '\n  ' + annotation + ': ' + this.pod.annotations[annotation]
            }
            s += '\nKOV Metadata:'
            if (this.pod.kovmetadata) {
                for (var meta of Object.keys(this.pod.kovmetadata).sort()) {
                    s += '\n  ' + meta + ': ' + this.pod.kovmetadata[meta]
                }
            }
            s += '\nContainers:'
            for (const container of this.pod.containers) {
                s += '\n  ' + container.name + ': '
                if (container.state) {
                    const key = Object.keys(container.state)[0]
                    s += key
                    if (container.state[key].reason) {
                        // "CrashLoopBackOff"
                        s += ': ' + container.state[key].reason
                    }
                }
                if (container.restartCount) {
                    s += ' (' + container.restartCount + ' restarts)'
                }
            }
            s += '\nCPU:'
            s += '\n  Requested: ' + (resources.cpu.requested / FACTORS.m).toFixed(0) + ' m'
            s += '\n  Limit:     ' + (resources.cpu.limit / FACTORS.m).toFixed(0) + ' m'
            s += '\n  Used:      ' + (resources.cpu.used / FACTORS.m).toFixed(0) + ' m'
            s += '\nMemory:'
            s += '\n  Requested: ' + (resources.memory.requested / FACTORS.Mi).toFixed(0) + ' MiB'
            s += '\n  Limit:     ' + (resources.memory.limit / FACTORS.Mi).toFixed(0) + ' MiB'
            s += '\n  Used:      ' + (resources.memory.used / FACTORS.Mi).toFixed(0) + ' MiB'

            this.tooltip.setText(s)
            this.tooltip.position = this.toGlobal(new PIXI.Point(10, 10))
            this.tooltip.visible = true
        })
        podBox.on('mouseout', function () {
            podBox.filters = podBox.filters.filter(x => x != BRIGHTNESS_FILTER)
            this.tooltip.visible = false
        })
        podBox.lineStyle(1, App.current.theme.primaryColor, 1)
        const w = 10 / this.pod.containers.length
        for (let i = 0; i < this.pod.containers.length; i++) {
            podBox.drawRect(i * w, 0, w, 10)
        }

        this.initialiseMetadataDefaults()
        const view = this.getSummary(App.current.getOverlay(), allReady, allRunning)

        podBox.lineStyle(2, view.color, 1)
        podBox.beginFill(view.color, 0.2)
        podBox.drawRect(0, 0, 10, 10)
        if (this.pod.deleted) {
            if (!this.cross) {
                const cross = new PIXI.Graphics()
                cross.lineStyle(3, 0xff0000, 1)
                cross.moveTo(0, 0)
                cross.lineTo(10, 10)
                cross.moveTo(10, 0)
                cross.lineTo(0, 10)
                cross.pivot.x = 5
                cross.pivot.y = 5
                cross.x = 5
                cross.y = 5
                cross.blendMode = PIXI.BLEND_MODES.ADD
                this.addChild(cross)
                this.cross = cross
            }
            view.newTick = this.terminating
        }

        if (restarts) {
            this.lineStyle(2, 0xff9999, 1)
            for (let i = 0; i < Math.min(restarts, 4); i++) {
                this.moveTo(10, i * 3 - 1)
                this.lineTo(10, i * 3 + 1)
            }
        }

        if (view.newTick && view.newTick != this.tick) {
            this.tick = view.newTick
            // important: only register new listener if it does not exist yet!
            // (otherwise we leak listeners)
            PIXI.ticker.shared.add(this.tick, this)
        } else if (!view.newTick && this.tick) {
            PIXI.ticker.shared.remove(this.tick, this)
            this.tick = null
            this.alpha = this._progress
            this.tint = 0xffffff
        }

        // CPU
        const cpu = new PIXI.Text('CPU', {fontFamily: 'ShareTechMono', fontSize: 10, fill: 0x000000, resolution: 10})
        cpu.scale.x = 8 / cpu.width
        cpu.scale.y = 1 / cpu.height
        cpu.rotation = Math.PI/2
        cpu.position.x = 2
        cpu.position.y = 1
        podBox.addChild(cpu)

        const scaleCpu = resources.cpu.requested <= resources.cpu.limit ? resources.cpu.limit / 8 : resources.cpu.requested / 8
        const scaledCpuReq = resources.cpu.requested !== 0 && scaleCpu !== 0 ? resources.cpu.requested / scaleCpu : 0
        const scaledCpuUsed = resources.cpu.used !== 0 && scaleCpu !== 0 ? resources.cpu.used / scaleCpu : 0
        podBox.lineStyle()
        podBox.beginFill(0x0000FF, 1)
        podBox.drawRect(1, 1, 1, 8)
        podBox.beginFill(getBarColor(resources.cpu.requested, resources.cpu.limit), 1)
        podBox.drawRect(2, 9 - scaledCpuReq, 1, scaledCpuReq)
        podBox.beginFill(getBarColor(resources.cpu.used, resources.cpu.limit), 1)
        podBox.drawRect(3, 9 - scaledCpuUsed, 1, scaledCpuUsed)
        podBox.endFill()

        // Memory
        const memory = new PIXI.Text('Memory', {fontFamily: 'ShareTechMono', fontSize: 10, fill: 0x000000, resolution: 10})
        memory.scale.x = 8 / memory.width
        memory.scale.y = 1 / memory.height
        memory.rotation = Math.PI/2
        memory.position.x = 6
        memory.position.y = 1
        podBox.addChild(memory)

        const scale = resources.memory.requested <= resources.memory.limit ? resources.memory.limit / 8 : resources.memory.requested / 8
        const scaledMemReq = resources.memory.requested !== 0 && scale !== 0 ? resources.memory.requested / scale : 0
        const scaledMemUsed = resources.memory.used !== 0 && scale !== 0 ? resources.memory.used / scale : 0
        podBox.lineStyle()
        podBox.beginFill(0x0000FF, 1)
        podBox.drawRect(5, 1, 1, 8)
        podBox.beginFill(getBarColor(resources.memory.requested, resources.memory.limit), 1)
        podBox.drawRect(6, 9 - scaledMemReq, 1, scaledMemReq)
        podBox.beginFill(getBarColor(resources.memory.used, resources.memory.limit), 1)
        podBox.drawRect(7, 9 - scaledMemUsed, 1, scaledMemUsed)
        podBox.endFill()

        return this
    }

    standardPodSummary(allReady, allRunning) {
        if (this.pod.phase == 'Succeeded') {
            // completed Job
            return {color: 0xaaaaff}
        } else if (this.pod.phase == 'Running' && allReady) {
            return {color: 0xaaffaa}
        } else if (this.pod.phase == 'Running' && allRunning && !allReady) {
            // all containers running, but some not ready (readinessProbe)
            return {newTick: this.pulsate, color: 0xaaffaa}
        } else if (this.pod.phase == 'Pending') {
            return {newTick: this.pulsate, color: 0xffffaa}
        } else {
            // CrashLoopBackOff, ImagePullBackOff or other unknown state
            return {newTick: this.crashing, color: 0xffaaaa}
        }
    }

    semverPodSummary(field) {
        // make sure this annotation is available on every pod, set to null if it is missing
        Object.values(ALL_PODS).forEach(current => {
            current.pod.kovmetadata = current.pod.kovmetadata || []
        })

        // If the metadata is not set at all, show as a grey tile
        if (this.pod.kovmetadata[field] === undefined) {
            return {color: UNDEFINED_METADATA_VALUE_COLOR}
        }

        // If the metadata is set to an empty string, so as a blue tile
        if (!this.pod.kovmetadata[field]) {
            return {color: EMPTY_METADATA_VALUE_COLOR}
        }

        // Fall back to finding the ranges manually.
        const versions = Object.values(ALL_PODS)
            .map(current => current.pod.kovmetadata[field])
            .filter(current => current)
            .filter((v, i, a) => a.indexOf(v) === i)
            .sort((current, next) => compareSemVer(current, next))

        if (versions.length === 0) {
            return {color: PIXI.utils.rgb2hex(HSVtoRGB(0, 1, 1))}
        }

        return {color: PIXI.utils.rgb2hex(
            HSVtoRGB(
                (versions.indexOf(this.pod.kovmetadata[field]) + 1) / versions.length * MAX_HUE,
                1,
                1))}
    }

    numericPodSummary(field) {
        // make sure this annotation is available on every pod, set to null if it is missing
        Object.values(ALL_PODS).forEach(current => {
            current.pod.kovmetadata = current.pod.kovmetadata || []
        })

        // If the metadata is not set at all, show as a grey tile
        if (this.pod.kovmetadata[field] === undefined) {
            return {color: UNDEFINED_METADATA_VALUE_COLOR}
        }

        // If the metadata is set to an empty string, so as a blue tile
        if (!this.pod.kovmetadata[field]) {
            return {color: EMPTY_METADATA_VALUE_COLOR}
        }

        // Attempt to display the overlay based on the hard coded ranges
        if (this.pod.kovmetadata[field + '.meta']) {
            try {
                const metaJson = JSON.parse(this.pod.kovmetadata[field + '.meta'])
                const smallPreference = metaJson.preference === 'small'
                const nowEpoch = Math.round((new Date()).getTime() / 1000)
                const max = metaJson.maxrel !== undefined
                    ? metaJson.maxrel + nowEpoch
                    : metaJson.max
                const min = metaJson.minrel !== undefined
                    ? metaJson.minrel + nowEpoch
                    : metaJson.min
                const normalizedRange = max - min
                const color = normalizedRange === 0
                    ? 0
                    : Math.max(Math.min(((Number(this.pod.kovmetadata[field]) || min) - min) / normalizedRange, 1), 0)
                return {color: PIXI.utils.rgb2hex(HSVtoRGB(smallPreference ? MAX_HUE - color * MAX_HUE : color * MAX_HUE, 1, 1))}
            } catch (e) {
                // probably bad json, so fall back to not using any metadata
            }
        }

        // Fall back to finding the ranges manually
        const range = Object.values(ALL_PODS).reduce((memo, current) => {
            if (!memo) {
                return {
                    min: Number(current.pod.kovmetadata[field]) || 0,
                    max: Number(current.pod.kovmetadata[field]) || 0
                }
            }

            if (current.pod.kovmetadata[field] && Number(current.pod.kovmetadata[field])) {
                if (Number(current.pod.kovmetadata[field].toString().trim()) < memo.min) {
                    return {min: Number(current.pod.kovmetadata[field]), max: memo.max}
                }

                if (Number(current.pod.kovmetadata[field].toString().trim()) > memo.max) {
                    return {min: memo.min, max: Number(current.pod.kovmetadata[field])}
                }
            }

            return memo
        }, null)

        const normalizedRange = range.max - range.min
        const color = normalizedRange === 0 ? 0 : ((Number(this.pod.kovmetadata[field]) || range.min) - range.min) / normalizedRange
        return {color: PIXI.utils.rgb2hex(HSVtoRGB(color * MAX_HUE, 1, 1))}
    }

    booleanPodSummary(field) {
        // If the metadata is not set at all, show as a grey tile
        if (this.pod.kovmetadata[field] === undefined || this.pod.kovmetadata[field] === null) {
            return {color: UNDEFINED_METADATA_VALUE_COLOR}
        }

        // If the metadata is set to an empty string, so as a blue tile
        if (!this.pod.kovmetadata[field]) {
            return {color: EMPTY_METADATA_VALUE_COLOR}
        }

        return {color: PIXI.utils.rgb2hex(HSVtoRGB(
            this.pod.kovmetadata[field].toString().trim().toLowerCase() === 'false' ? 0 : MAX_HUE,
            1,
            1))}
    }

    /**
     * Generate a random color for the pod based on the string metadata value
     * @param field The metadata field
     * @returns {{color: number}} A color based on the value of the metadata field
     */
    genericPodSummary(field) {
        // If the metadata is not set at all, show as a grey tile
        if (this.pod.kovmetadata[field] === undefined || this.pod.kovmetadata[field] === null) {
            return {color: UNDEFINED_METADATA_VALUE_COLOR}
        }

        // If the metadata is set to an empty string, so as a blue tile
        if (!this.pod.kovmetadata[field]) {
            return {color: EMPTY_METADATA_VALUE_COLOR}
        }

        return {color: PIXI.utils.rgb2hex(HSVtoRGB(
            (Math.abs(hashCode(this.pod.kovmetadata[field].toString().trim())) % 255) / 255 * MAX_HUE,
            1,
            1))}
    }

    initialiseMetadataDefaults() {
        // make sure this annotation is available on every pod, set to null if it is missing
        Object.values(ALL_PODS).forEach(current => {
            current.pod.kovmetadata = current.pod.kovmetadata || []
        })
    }

    getSummary(field, allReady, allRunning) {
        if (field === 'default') {
            return this.standardPodSummary(allReady, allRunning)
        }

        if (this.allMetadataIsNumeric(field)) {
            return this.numericPodSummary(field)
        }

        if (this.allMetadataIsBoolean(field)) {
            return this.booleanPodSummary(field)
        }

        if (this.allMetadataIsSemver(field)) {
            return this.semverPodSummary(field)
        }

        return this.genericPodSummary(field)
    }

    /**
     * Check to see if all the metadata values are semver values
     * @param field The metadata field to inspect
     * @returns {boolean} true if all fields are empty, undefined, null or semver strings
     */
    allMetadataIsSemver(field) {
        return Object.values(ALL_PODS).every(current =>
            current.pod.kovmetadata[field] === undefined ||
            current.pod.kovmetadata[field] === null ||
            current.pod.kovmetadata[field].toString().trim() === '' ||
            isValidSemVer(current.pod.kovmetadata[field].toString().trim()))
    }

    /**
     * Check to see if all the metadata values are numbers
     * @param field The metadata field to inspect
     * @returns {boolean} true if all fields are empty, undefined, null or numbers
     */
    allMetadataIsNumeric(field) {
        return Object.values(ALL_PODS).every(current =>
            current.pod.kovmetadata[field] === undefined ||
            current.pod.kovmetadata[field] === null ||
            current.pod.kovmetadata[field].toString().trim() === '' ||
            Number(current.pod.kovmetadata[field].toString().trim()))
    }

    /**
     * Check to see if all the metadata values are numbers
     * @param field The metadata field to inspect
     * @returns {boolean} true if all fields are empty, undefined, null or boolean strings
     */
    allMetadataIsBoolean(field) {
        return Object.values(ALL_PODS).every(current =>
            current.pod.kovmetadata[field] === undefined ||
            current.pod.kovmetadata[field] === null ||
            current.pod.kovmetadata[field].toString().trim() === '' ||
            current.pod.kovmetadata[field].toString().trim().toLowerCase() === 'false' ||
            current.pod.kovmetadata[field].toString().trim().toLowerCase() === 'true')
    }

    /**
     * Handle the context menu of a pod
     */
    podMenu() {
        this.on('rightdown', function(event) {
            Pod.selected = this.pod
            this.menu.x = this.getGlobalPosition().x + this.getBounds().width + MENU_HORIZONTAL_PADDING
            this.menu.y = this.getGlobalPosition().y
            this.menu.visible = true
            event.stopPropagation()
        })
    }
}
