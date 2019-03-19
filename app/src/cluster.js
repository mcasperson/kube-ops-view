import Node from './node.js'
import {Pod} from './pod.js'
import App from './app.js'

const PIXI = require('pixi.js')

const CLUSTER_ZOOM = 1
const NODE_ZOOM = 4
/**
 * How long to wait for fresh data from the server before considering the information old
 * @type {number}
 */
const MAX_DATA_AGE = 120

export default class Cluster extends PIXI.Graphics {
    constructor (cluster, status, tooltip, menu, nodeMenu, clusterMenu, zoomInto) {
        super()
        this.cluster = cluster
        this.status = status
        this.tooltip = tooltip
        this.menu = menu
        this.nodeMenu = nodeMenu
        this.clusterMenu = clusterMenu
        this.zoomInto = zoomInto
        this.interactive = true
        const that = this
        this.on('mousedown', function (event) {
            if (event.data.button === 1) {
                zoomInto(that, CLUSTER_ZOOM)
                event.stopPropagation()
            }
        })
    }

    destroy(options) {
        if (this.tick) {
            PIXI.ticker.shared.remove(this.tick, this)
        }
        if (this.graphicsData) {
            this.clear()
            super.destroy(options)
        }
    }

    pulsate(_time) {
        const v = Math.sin((PIXI.ticker.shared.lastTime % 1000) / 1000. * Math.PI)
        this.alpha = 0.4 + (v * 0.6)
    }

    draw () {
        this.children.forEach(child => child.destroy(true))
        this.removeChildren()
        if (this.graphicsData) {
            this.clear()
        }

        const that = this
        const left = 10
        const top = 20
        const padding = 5
        let masterX = left
        let masterY = top
        let masterWidth = 0
        let masterHeight = 0
        let workerX = left
        let workerY = top
        let workerWidth = 0
        let workerHeight = 0
        const workerNodes = []
        const maxWidth = window.innerWidth - 130
        for (const nodeName of Object.keys(this.cluster.nodes).sort()) {
            const node = this.cluster.nodes[nodeName]
            var nodeBox = new Node(node, this, this.tooltip, this.menu, this.nodeMenu)
            nodeBox.interactive = true
            nodeBox.draw()
            nodeBox.on('mousedown', function(event) {
                if (event.data.button === 1) {
                    that.zoomInto(this, NODE_ZOOM)
                    event.stopPropagation()
                }
            })

            if (nodeBox.isMaster()) {
                if (masterX > maxWidth) {
                    masterWidth = masterX
                    masterX = left
                    masterY += nodeBox.height + padding
                    masterHeight += nodeBox.height + padding
                }
                if (masterHeight == 0) {
                    masterHeight = nodeBox.height + padding
                }
                nodeBox.x = masterX
                nodeBox.y = masterY
                masterX += nodeBox.width + padding
            } else {
                if (workerX > maxWidth) {
                    workerWidth = workerX
                    workerX = left
                    workerY += nodeBox.height + padding
                    workerHeight += nodeBox.height + padding
                }
                workerNodes.push(nodeBox)
                if (workerHeight == 0) {
                    workerHeight = nodeBox.height + padding
                }
                nodeBox.x = workerX
                nodeBox.y = workerY
                workerX += nodeBox.width + padding
            }
            this.addChild(nodeBox)
        }
        for (const nodeBox of workerNodes) {
            nodeBox.y += masterHeight
        }

        /*
            Place unassigned pods to the right of the master nodes, or
            to the right of the worker nodes if there were no masters.
         */
        var unassignedX = masterX === left ? workerX : masterX

        for (const pod of Object.values(this.cluster.unassigned_pods)) {
            var podBox = Pod.getOrCreate(pod, this, this.tooltip, this.menu)
            podBox.x = unassignedX
            podBox.y = masterY
            podBox.draw()
            this.addChild(podBox)
            unassignedX += 20
        }
        masterWidth = Math.max(unassignedX, masterWidth)
        workerWidth = Math.max(workerX, workerWidth)

        this.lineStyle(2, App.current.theme.primaryColor, 1)
        const width = Math.max(masterWidth, workerWidth)
        this.drawRect(0, 0, width, top + masterHeight + workerHeight)

        const topHandle = this.topHandle = new PIXI.Graphics()
        topHandle.beginFill(App.current.theme.primaryColor, 1)
        topHandle.drawRect(0, 0, width, 15)
        topHandle.endFill()
        topHandle.interactive = true
        topHandle.buttonMode = true
        topHandle.on('click', function(event) {
            if (event.data.button === 0) {
                App.current.toggleCluster(that.cluster.id)
                event.stopPropagation()
            }
        })
        const text = new PIXI.Text(this.cluster.api_server_url, {fontFamily: 'ShareTechMono', fontSize: 10, fill: 0x000000})
        text.x = 2
        text.y = 2
        topHandle.addChild(text)
        this.addChild(topHandle)

        topHandle.on('rightdown', function(event) {
            Cluster.selected = that.cluster
            that.clusterMenu.x = event.data.global.x
            that.clusterMenu.y = event.data.global.y
            that.clusterMenu.visible = true
            event.stopPropagation()
        })

        let newTick = null
        const nowSeconds = Date.now() / 1000
        if (this.status && this.status.last_query_time < nowSeconds - MAX_DATA_AGE) {
            newTick = this.pulsate
        }

        if (newTick && newTick != this.tick) {
            this.tick = newTick
            // important: only register new listener if it does not exist yet!
            // (otherwise we leak listeners)
            PIXI.ticker.shared.add(this.tick, this)
        } else if (!newTick && this.tick) {
            PIXI.ticker.shared.remove(this.tick, this)
            this.tick = null
            this.alpha = 1
            this.tint = 0xffffff
        }

        // Allow the empty space between nodes to be clicked
        this.hitArea = new PIXI.Rectangle(0, 0, this.width, this.height)
    }

}
