import Tooltip from './tooltip.js'
import Cluster from './cluster.js'
import {ALL_PODS, Pod, sortByAge, sortByCPU, sortByMemory, sortByName} from './pod.js'
import Node from './node.js'
import SelectBox from './selectbox'
import {ALL_THEMES, Theme} from './themes.js'
import {DESATURATION_FILTER} from './filters.js'
import {JSON_delta} from './vendor/json_delta.js'
import Config from './config.js'
import Button from './button'
import Menu, {ALL_MENUS} from './menu'
import {copyStringToClipboard} from './utils'
import Toast from './toast'

const PIXI = require('pixi.js')

const addWheelListener = require('./vendor/addWheelListener')

export default class App {

    constructor() {
        const params = this.parseLocationHash()
        this.config = Config.fromParams(params)
        this.filterString = (params.get('q') && decodeURIComponent(params.get('q'))) || ''
        this.selectedClusters = new Set((params.get('clusters') || '').split(',').filter(x => x))
        this.seenPods = new Set()
        this.sorterFn = ''
        this.overlay = localStorage.getItem('overlay') || 'default'
        this.overlayItems = []
        this.theme = Theme.get(localStorage.getItem('theme'))
        this.eventSource = null
        this.connectTime = null
        this.keepAliveTimer = null
        this.clusters = new Map()
        this.clusterStatuses = new Map()
        this.viewContainerTargetPosition = new PIXI.Point()
        this.bootstrapping = true
    }

    getOverlay() {
        if (this.overlayItems.indexOf(this.overlay) !== -1) {
            return this.overlay
        }

        return 'default'
    }

    parseLocationHash() {
        // hash startswith #
        const hash = document.location.hash.substring(1)
        const params = new Map()
        for (const pair of hash.split(';')) {
            const keyValue = pair.split('=', 2)
            if (keyValue.length == 2) {
                params.set(keyValue[0], keyValue[1])
            }
        }
        return params
    }

    changeLocationHash(key, value) {
        const params = this.parseLocationHash()
        params.set(key, value)
        const pairs = []
        for (const [key, value] of params) {
            if (value) {
                pairs.push(key + '=' + encodeURIComponent(value))
            }
        }

        document.location.hash = '#' + pairs.sort().join(';')
    }

    nameMatches(pod, searchString) {
        const name = pod.name
        return name && name.includes(searchString)
    }

    labelMatches(pod, name, value) {
        const labels = pod.labels
        return labels && labels[name] === value
    }

    createMatchesFunctionForQuery(query) {
        if (query.includes('=')) {
            const labelAndValue = query.split('=', 2)
            return pod => this.labelMatches(pod, labelAndValue[0], labelAndValue[1])
        } else {
            return pod => this.nameMatches(pod, query)
        }
    }

    filter() {
        const searchString = this.filterString
        if (this.searchText) {
            // this.searchText might be undefined (dashboard mode)
            this.searchText.text = searchString
        }
        this.changeLocationHash('q', searchString)
        const elementDisplayFilter = DESATURATION_FILTER
        const filterableElements = []
        const matchesQuery = this.createMatchesFunctionForQuery(searchString)
        for (const cluster of this.viewContainer.children) {
            for (const node of cluster.children) {
                if (node.pod) { // node is actually unassigned pod
                    filterableElements.push(node)
                }
                for (const pod of node.children) {
                    if (pod.pod) {
                        filterableElements.push(pod)
                    }
                }
            }
        }
        filterableElements.forEach(value => {
            if (!matchesQuery(value.pod)) {
                value.filters = [elementDisplayFilter]
            } else {
                // TODO: pod might have other filters set..
                value.filters = []
            }
        })
    }

    initialize() {
        App.current = this

        // create the renderer
        const noWebGL = this.config.renderer === 'canvas'
        const renderer = PIXI.autoDetectRenderer(256, 256, {resolution: 2}, noWebGL)
        renderer.view.style.display = 'block'
        renderer.autoResize = true
        renderer.resize(window.innerWidth, window.innerHeight)

        window.onresize = function () {
            renderer.resize(window.innerWidth, window.innerHeight)
        }

        //Add the canvas to the HTML document
        document.body.appendChild(renderer.view)
        this.renderer = renderer

        //Create a container object called the `stage`
        this.stage = new PIXI.Container()

        this.registerEventListeners()
        setInterval(this.pruneUnavailableClusters.bind(this), 5 * 1000)

        // prevent the context menu
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault()
        })

        if (this.config.reloadIntervalSeconds) {
            setTimeout(function () {
                location.reload(false)
            }, this.config.reloadIntervalSeconds * 1000)
        }
    }

    registerEventListeners() {
        function downHandler(event) {
            if (!App.stopGlobalEvents) {
                const panAmount = 20
                if (event.key == 'ArrowLeft') {
                    this.viewContainerTargetPosition.x += panAmount
                } else if (event.key == 'ArrowRight') {
                    this.viewContainerTargetPosition.x -= panAmount
                }
                if (event.key == 'ArrowUp') {
                    this.viewContainerTargetPosition.y += panAmount
                } else if (event.key == 'ArrowDown') {
                    this.viewContainerTargetPosition.y -= panAmount
                }
                if (event.key == 'PageUp') {
                    this.viewContainerTargetPosition.y += window.innerHeight
                } else if (event.key == 'PageDown') {
                    this.viewContainerTargetPosition.y -= window.innerHeight
                } else if (event.key == 'Home') {
                    this.viewContainerTargetPosition.x = 20
                    this.viewContainerTargetPosition.y = this.config.dashboardMode ? 20 : 40
                } else if (event.key && event.key.length == 1 && !event.ctrlKey && !event.metaKey) {
                    this.filterString += event.key
                    this.filter()
                    event.preventDefault()
                } else if (event.key == 'Backspace') {
                    this.filterString = this.filterString.slice(0, Math.max(0, this.filterString.length - 1))
                    this.filter()
                    event.preventDefault()
                }
            }
            App.stopGlobalEvents = false
        }

        var isDragging = false,
            prevX, prevY

        function mouseDownHandler(event) {
            if (!App.stopGlobalEvents) {
                if (event.button === 0) {
                    prevX = event.clientX
                    prevY = event.clientY
                    isDragging = true
                    this.renderer.view.style.cursor = 'move'
                    this.clearMenus()
                }
            }
            App.stopGlobalEvents = false
        }

        function mouseMoveHandler(event) {
            if (!App.stopGlobalEvents) {
                if (!isDragging) {
                    return
                }
                var dx = event.clientX - prevX
                var dy = event.clientY - prevY

                this.viewContainer.x += dx
                this.viewContainer.y += dy
                // stop any current move animation
                this.viewContainerTargetPosition.x = this.viewContainer.x
                this.viewContainerTargetPosition.y = this.viewContainer.y
                prevX = event.clientX
                prevY = event.clientY
            }
            App.stopGlobalEvents = false
        }

        function mouseUpHandler(_event) {
            if (!App.stopGlobalEvents) {
                isDragging = false
                this.renderer.view.style.cursor = 'default'
            }
            App.stopGlobalEvents = false
        }

        function touchStartHandler(event) {
            if (!App.stopGlobalEvents) {
                if (event.touches.length == 1) {
                    const touch = event.touches[0]
                    prevX = touch.clientX
                    prevY = touch.clientY
                    isDragging = true
                }
            }
            App.stopGlobalEvents = false
        }

        function touchMoveHandler(event) {
            if (!App.stopGlobalEvents) {
                if (!isDragging) {
                    return
                }
                if (event.touches.length == 1) {
                    const touch = event.touches[0]
                    var dx = touch.clientX - prevX
                    var dy = touch.clientY - prevY

                    this.viewContainer.x += dx
                    this.viewContainer.y += dy
                    // stop any current move animation
                    this.viewContainerTargetPosition.x = this.viewContainer.x
                    this.viewContainerTargetPosition.y = this.viewContainer.y
                    prevX = touch.clientX
                    prevY = touch.clientY

                    this.clearMenus()
                }
            }
            App.stopGlobalEvents = false
        }

        function touchEndHandler(_event) {
            if (!App.stopGlobalEvents) {
                isDragging = false
            }
            App.stopGlobalEvents = false
        }

        addEventListener('keydown', downHandler.bind(this), false)
        addEventListener('mousedown', mouseDownHandler.bind(this), false)
        addEventListener('mousemove', mouseMoveHandler.bind(this), false)
        addEventListener('mouseup', mouseUpHandler.bind(this), false)
        addEventListener('touchstart', touchStartHandler.bind(this), false)
        addEventListener('touchmove', touchMoveHandler.bind(this), false)
        addEventListener('touchend', touchEndHandler.bind(this), false)

        const that = this
        const interactionObj = new PIXI.interaction.InteractionData()

        function getLocalCoordinates(x, y) {
            return interactionObj.getLocalPosition(that.viewContainer, undefined, {x: x, y: y})
        }

        const minScale = 1 / 32
        const maxScale = 32

        function zoom(x, y, isZoomIn) {
            const direction = isZoomIn ? 1 : -1
            const factor = (1 + direction * 0.1)
            const newScale = Math.min(Math.max(that.viewContainer.scale.x * factor, minScale), maxScale)
            that.viewContainer.scale.set(newScale)

            // zoom around one point on ViewContainer
            const beforeTransform = getLocalCoordinates(x, y)
            that.viewContainer.updateTransform()
            const afterTransform = getLocalCoordinates(x, y)

            that.viewContainer.x += (afterTransform.x - beforeTransform.x) * newScale
            that.viewContainer.y += (afterTransform.y - beforeTransform.y) * newScale

            // stop any current move animation
            that.viewContainerTargetPosition.x = that.viewContainer.x
            that.viewContainerTargetPosition.y = that.viewContainer.y

            that.clearMenus()
        }

        addWheelListener(this.renderer.view, function (e) {
            zoom(e.clientX, e.clientY, e.deltaY < 0)
        })
    }

    /**
     * Hide any context menus when we start zooming or panning
     */
    clearMenus() {
        ALL_MENUS.forEach(menu => menu.visible = false)
    }

    drawMenuBar() {
        this.menuBar = this.createMenuBar()
        this.drawResetButton(this.menuBar)
        this.drawSearch()
        this.drawSort(this.menuBar)
        this.drawTheme()
        this.drawOverlay()
    }

    createMenuBar() {
        const menuBar = new PIXI.Graphics()
        menuBar.beginFill(this.theme.secondaryColor, 1)
        menuBar.drawRect(0, 0, this.renderer.width, 28)
        menuBar.lineStyle(2, this.theme.secondaryColor, 1)
        menuBar.moveTo(0, 28)
        menuBar.lineTo(this.renderer.width, 28)
        menuBar.lineStyle(1, this.theme.primaryColor, 1)
        menuBar.drawRect(20, 3, 200, 22)
        this.stage.addChild(menuBar)
        return menuBar
    }

    drawTheme() {
        const themeOptions = Object.keys(ALL_THEMES).sort().map(name => {
            return {text: name.toUpperCase(), value: name}
        })
        const app = this
        const themeSelector = new SelectBox(themeOptions, this.theme.name, function (value) {
            app.switchTheme(value)
        })
        themeSelector.x = 500
        themeSelector.y = 3
        this.menuBar.addChild(themeSelector.draw())
    }

    drawSort() {
        const items = [
            {
                text: 'SORT: NAME', value: sortByName
            },
            {
                text: 'SORT: AGE', value: sortByAge
            },
            {
                text: 'SORT: MEMORY', value: sortByMemory
            },
            {
                text: 'SORT: CPU', value: sortByCPU
            }
        ]
        //setting default sort
        this.sorterFn = items[0].value
        const app = this
        const selectBox = new SelectBox(items, this.sorterFn, function (value) {
            app.changeSorting(value)
        })
        selectBox.x = 345
        selectBox.y = 3
        this.menuBar.addChild(selectBox.draw())
    }

    drawSearch() {
        const searchPrompt = new PIXI.Text('>', {
            fontFamily: 'ShareTechMono',
            fontSize: 14,
            fill: this.theme.primaryColor
        })
        searchPrompt.x = 26
        searchPrompt.y = 8
        PIXI.ticker.shared.add(function (_) {
            var v = Math.sin((PIXI.ticker.shared.lastTime % 2000) / 2000. * Math.PI)
            searchPrompt.alpha = v
        })
        this.stage.addChild(searchPrompt)

        const searchText = new PIXI.Text('', {fontFamily: 'ShareTechMono', fontSize: 14, fill: this.theme.primaryColor})
        searchText.x = 40
        searchText.y = 8
        this.stage.addChild(searchText)
        this.searchText = searchText
    }

    drawOverlay() {
        if (this.overlayOptions) {
            this.menuBar.removeChild(this.overlayOptions)
            this.overlayOptions.destroy()
        }

        this.overlayItems = Array.from(this.clusters.entries())
            .flatMap(cluster => cluster[1].nodes && Object.values(cluster[1].nodes) || [])
            .flatMap(node => node.pods && Object.values(node.pods) || [])
            .flatMap(current => current.kovmetadata && Object.keys(current.kovmetadata) || [])
            .filter(meta => !meta.endsWith('.meta'))
            .filter((v, i, a) => a.indexOf(v) === i)
        this.overlayItems.push('default')

        const selectBoxItems = this.overlayItems.map(i => {
            return {text: i, value: i}
        })

        const that = this
        const overlayOptions = new SelectBox(selectBoxItems, that.getOverlay(), function (value) {
            that.overlay = value
            localStorage.setItem('overlay', value)
            that.update()
        })
        overlayOptions.x = 660
        overlayOptions.y = 3
        this.menuBar.addChild(overlayOptions.draw())
        this.overlayOptions = overlayOptions
    }

    drawResetButton(menuBar) {
        const resetButton = new Button('RESET', () => {
            this.draw()
            this.update()
        })
        resetButton.x = 265
        resetButton.y = 3
        menuBar.addChild(resetButton.draw())
    }

    draw() {
        this.stage.removeChildren()
        this.theme.apply(this.stage)

        this.buildViewContainer()

        if (!this.config.dashboardMode) {
            this.drawMenuBar()
        }

        this.buildTooltip()
        this.buildPodMenu()
        this.buildNodeMenu()
        this.buildClusterMenu()
        this.initMenus()
    }

    buildViewContainer() {
        const viewContainer = this.viewContainer || new PIXI.Container()
        viewContainer.scale.set(this.config.initialScale)
        viewContainer.x = 20
        viewContainer.y = this.config.dashboardMode ? 20 : 40
        this.viewContainerTargetPosition.x = viewContainer.x
        this.viewContainerTargetPosition.y = viewContainer.y
        this.stage.addChild(viewContainer)
        this.viewContainer = viewContainer
    }

    buildTooltip() {
        const tooltip = this.tooltip || new Tooltip()
        tooltip.draw()
        this.stage.addChild(tooltip)
        this.tooltip = tooltip
    }

    displayClipboardToast() {
        this.stage.addChild(new Toast('Copied command to clipboard').draw())
    }

    initMenus() {
        ALL_MENUS.forEach(menu => {
            this.stage.addChild(menu)
            menu.draw()
            menu.visible = false
        })
    }

    /**
     * Builds a button that copies a string to the clipboard
     * @param label The button label
     * @param generateCommand A function that returns the command string
     * @returns {Button} A new button object
     */
    copyCommandToClipboard(generateCommand) {
        const that = this
        return function (event) {
            App.stopGlobalEvents = true
            event.stopPropagation()
            copyStringToClipboard(generateCommand())
            that.clearMenus()
            that.displayClipboardToast()
        }
    }

    buildClusterMenu() {
        const that = this

        const clusterMenu = this.clusterMenu || new Menu()
            .addSubMenu('Manage >', function(subMenu) {
                subMenu
                    .addButton(
                        'Version',
                        that.copyCommandToClipboard(
                            () => 'kubectl version'))
                    .addButton(
                        'Cluster Info',
                        that.copyCommandToClipboard(
                            () => 'kubectl cluster-info'))
                    .addButton(
                        'Cluster Info Dump',
                        that.copyCommandToClipboard(
                            () =>'kubectl cluster-info dump'))
                    .addButton(
                        'API Versions',
                        that.copyCommandToClipboard(
                            () => 'kubectl api-versions'))
                    .addButton(
                        'API Resources',
                        that.copyCommandToClipboard(
                            () => 'kubectl api-resources'))
            })
            .addSubMenu('Docker >', function(subMenu) {
                subMenu
                    .addButton(
                        'Run Container',
                        that.copyCommandToClipboard(
                            () => 'kubectl run --image=<image> <name> --port=<port> --env="<environment variable name>=<environment variable value>"'))
                    .addButton(
                        'Expose Container',
                        that.copyCommandToClipboard(
                            () => 'kubectl expose deployment <name> --port=<port> --name=<name>'))
                    .addButton(
                        'Attach To Container',
                        that.copyCommandToClipboard(
                            () => 'kubectl attach -it <name>'))
            })
        this.clusterMenu = clusterMenu
    }

    buildNodeMenu() {
        const that = this

        const nodeMenu = this.nodeMenu || new Menu()
            .addSubMenu('Get >', function(subMenu) {
                subMenu
                    .addButton(
                        'Get Node',
                        that.copyCommandToClipboard(
                            () => 'kubectl get node ' + Node.selected.name))
            })
            .addSubMenu('Describe >', function(subMenu) {
                subMenu
                    .addButton(
                        'Describe Node',
                        that.copyCommandToClipboard(
                            () => 'kubectl describe node ' + Node.selected.name))
            })
            .addSubMenu('Label & Annotate >', function (subMenu) {
                subMenu
                    .addButton('Label Node', that.copyCommandToClipboard(
                        function () {
                            'kubectl label nodes ' + Node.selected.name + ' label-name=label-value'
                        }))
                    .addButton('Annotate Node', that.copyCommandToClipboard(
                        function () {
                            'kubectl annotate nodes ' + Node.selected.name + ' annotation-name=annotation-value'
                        }))
            })
            .addSubMenu('Manage >', function(subMenu) {
                subMenu
                    .addButton(
                        'Drain Node',
                        that.copyCommandToClipboard(
                            () => 'kubectl drain ' + Node.selected.name))
                    .addButton(
                        'Cordon Node',
                        that.copyCommandToClipboard(
                            () =>'kubectl cordon ' + Node.selected.name))
                    .addButton(
                        'Uncordon Node',
                        that.copyCommandToClipboard(
                            () => 'kubectl taint nodes ' + Node.selected.name + ' key=value:taintname'))
                    .addButton(
                        'Untaint Node',
                        that.copyCommandToClipboard(
                            () => 'kubectl taint nodes ' + Node.selected.name + ' key=value:taintname-'))
                    .addButton(
                        'Top Node',
                        that.copyCommandToClipboard(
                            () => 'kubectl top node ' + Node.selected.name))
            })
        this.nodeMenu = nodeMenu
    }

    buildPodMenu() {
        const that = this

        const menu = this.menu || new Menu()
            .addSubMenu('Get >', function (subMenu) {
                subMenu
                    .addButton(
                        'Get Pod',
                        that.copyCommandToClipboard(
                            () => 'kubectl get pod ' + Pod.selected.name + ' -n ' + Pod.selected.namespace))
            })
            .addSubMenu('Describe >', function (subMenu) {
                subMenu
                    .addButton(
                        'Describe Pod',
                        that.copyCommandToClipboard(
                            () => 'kubectl describe pod ' + Pod.selected.name + ' -n ' + Pod.selected.namespace))
            })
            .addSubMenu('Logs >', function (subMenu) {
                subMenu
                    .addButton(
                        'Pod Logs',
                        that.copyCommandToClipboard(
                            () => 'kubectl logs ' + Pod.selected.name + ' -n ' + Pod.selected.namespace))
                    .addButton(
                        'Pod Logs Following',
                        that.copyCommandToClipboard(
                            ()=> 'kubectl logs ' + Pod.selected.name + ' -n ' + Pod.selected.namespace + ' -f'))
                    .addButton(
                        'Pod Logs Previous',
                        that.copyCommandToClipboard(
                            () => 'kubectl logs --previous ' + Pod.selected.name + ' -n ' + Pod.selected.namespace))
            })
            .addSubMenu('Delete >', function (subMenu) {
                subMenu
                    .addButton('Delete Pod', that.copyCommandToClipboard(
                        () => 'kubectl delete pod ' + Pod.selected.name + ' -n ' + Pod.selected.namespace))
            })
            .addSubMenu('Label & Annotate >', function (subMenu) {
                subMenu
                    .addButton('Label Pod', that.copyCommandToClipboard(
                        () => 'kubectl label pods ' + Pod.selected.name + ' -n ' + Pod.selected.namespace + ' label-name=label-value'))
                    .addButton('Annotate Pod', that.copyCommandToClipboard(
                        () => 'kubectl annotate pods ' + Pod.selected.name + ' -n ' + Pod.selected.namespace + ' annotation-name=annotation-value'))
            })
            .addSubMenu('Manage >', function (subMenu) {
                subMenu
                    .addButton(
                        'Powershell Exec',
                        that.copyCommandToClipboard(
                            () => 'kubectl exec ' + Pod.selected.name + ' -n ' + Pod.selected.namespace +
                                ' -- powershell -Command "<command>"'))
                    .addButton(
                        'Bash Exec',
                        that.copyCommandToClipboard(
                            () => 'kubectl exec ' + Pod.selected.name + ' -n ' + Pod.selected.namespace +
                                ' -- /bin/bash -c "<command>"'))
                    .addButton(
                        'Powershell Interactive',
                        that.copyCommandToClipboard(
                            () => 'kubectl exec ' + Pod.selected.name + ' -n ' + Pod.selected.namespace +
                                ' -it -- powershell'))
                    .addButton(
                        'Bash Interactive',
                        that.copyCommandToClipboard(
                            () => 'kubectl exec ' + Pod.selected.name + ' -n ' + Pod.selected.namespace +
                                ' -it -- /bin/bash'))
                    .addButton(
                        'Top Pod',
                        that.copyCommandToClipboard(
                            () => 'kubectl top pod ' + Pod.selected.name + ' -n ' + Pod.selected.namespace))
            })
            .addSubMenu('Copy >', function (subMenu) {
                subMenu
                    .addButton('Copy From Pod', that.copyCommandToClipboard(
                        () => 'kubectl cp ' + Pod.selected.namespace + '/' + Pod.selected.name + ':/a/file/in/the/pod /some/local/file'))
                    .addButton('Copy Into Pod', that.copyCommandToClipboard(
                        () => 'kubectl cp /some/local/file ' + Pod.selected.namespace + '/' + Pod.selected.name + ':/a/file/in/the/pod'))
            })
            .addSubMenu('Fields >', function (subMenu) {
                subMenu
                    .addButton('Namespace', that.copyCommandToClipboard(
                        () => Pod.selected.namespace))
                    .addButton('Name', that.copyCommandToClipboard(
                        () => Pod.selected.name))
            })

        this.menu = menu
    }

    animatePodCreation(originalPod, globalPosition) {
        const pod = new Pod(originalPod.pod, null, this.tooltip, this.menu)
        pod.draw()
        pod.blendMode = PIXI.BLEND_MODES.ADD
        pod.interactive = false
        const targetPosition = globalPosition
        const angle = Math.random() * Math.PI * 2
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const distance = Math.max(200, Math.random() * Math.min(this.renderer.width, this.renderer.height))
        // blur filter looks cool, but has huge performance penalty
        // const blur = new PIXI.filters.BlurFilter(20, 2)
        // pod.filters = [blur]
        pod.pivot.x = pod.width / 2
        pod.pivot.y = pod.height / 2
        pod.alpha = 0
        pod._progress = 0
        originalPod.visible = false
        const that = this
        const tick = function (t) {
            // progress goes from 0 to 1
            const progress = Math.min(1, pod._progress + (0.01 * t))
            const scale = 1 + ((1 - progress) * 140)
            pod._progress = progress
            pod.x = targetPosition.x + (distance * cos * (1 - progress))
            pod.y = targetPosition.y + (distance * sin * (1 - progress))
            pod.alpha = progress
            pod.rotation = progress * progress * Math.PI * 2
            // blur.blur = (1 - alpha) * 20
            pod.scale.set(scale)
            if (progress >= 1) {
                PIXI.ticker.shared.remove(tick)
                that.stage.removeChild(pod)
                pod.destroy()
                originalPod.visible = true
            }
        }
        PIXI.ticker.shared.add(tick)
        this.stage.addChild(pod)
    }

    animatePodDeletion(originalPod, globalPosition) {
        const pod = new Pod(originalPod.pod, null, this.tooltip, this.menu)
        pod.draw()
        pod.blendMode = PIXI.BLEND_MODES.ADD
        const globalCenter = new PIXI.Point(globalPosition.x + pod.width / 2, globalPosition.y + pod.height / 2)
        const blur = new PIXI.filters.BlurFilter(4)
        pod.filters = [blur]
        pod.position = globalPosition.clone()
        pod.alpha = 1
        pod._progress = 1
        originalPod.destroy()
        const that = this
        const tick = function (t) {
            // progress goes from 1 to 0
            const progress = Math.max(0, pod._progress - (0.02 * t))
            const scale = 1 + ((1 - progress) * 8)
            pod._progress = progress
            pod.alpha = progress
            pod.scale.set(scale)
            pod.position.set(globalCenter.x - pod.width / 2, globalCenter.y - pod.height / 2)

            if (progress <= 0) {
                PIXI.ticker.shared.remove(tick)
                that.stage.removeChild(pod)
                pod.destroy()
            }
        }
        PIXI.ticker.shared.add(tick)
        this.stage.addChild(pod)
    }

    update() {
        this.drawOverlay()

        // make sure we create a copy (this.clusters might get modified)
        const clusters = Array.from(this.clusters.entries()).sort().map(idCluster => idCluster[1])
        const that = this
        let changes = 0
        const podKeys = new Set()
        for (const cluster of clusters) {
            for (const node of Object.values(cluster.nodes)) {
                for (const pod of Object.values(node.pods)) {
                    podKeys.add(cluster.id + '/' + pod.namespace + '/' + pod.name)
                }
            }
            for (const pod of Object.values(cluster.unassigned_pods)) {
                podKeys.add(cluster.id + '/' + pod.namespace + '/' + pod.name)
            }
        }
        for (const key of Object.keys(ALL_PODS)) {
            const pod = ALL_PODS[key]
            if (!podKeys.has(key)) {
                // pod was deleted
                delete ALL_PODS[key]
                this.seenPods.delete(key)
                if (changes < 10) {
                    // NOTE: we need to do this BEFORE removeChildren()
                    // to get correct global coordinates
                    const globalPos = pod.toGlobal({x: 0, y: 0})
                    window.setTimeout(function () {
                        that.animatePodDeletion(pod, globalPos)
                    }, 100 * changes)
                } else {
                    pod.destroy()
                }
                changes++
            }
        }
        const clusterComponentById = {}
        for (const component of this.viewContainer.children) {
            clusterComponentById[component.cluster.id] = component
        }
        let y = 0
        const clusterIds = new Set()
        for (const cluster of clusters) {
            if (!this.selectedClusters.size || this.selectedClusters.has(cluster.id)) {
                clusterIds.add(cluster.id)
                const status = this.clusterStatuses.get(cluster.id)
                let clusterBox = clusterComponentById[cluster.id]
                if (!clusterBox) {
                    clusterBox = new Cluster(
                        cluster,
                        status,
                        this.tooltip,
                        this.menu,
                        this.nodeMenu,
                        this.clusterMenu,
                        this.zoomInto.bind(this))
                    this.viewContainer.addChild(clusterBox)
                } else {
                    clusterBox.cluster = cluster
                    clusterBox.status = status
                }
                clusterBox.draw()
                clusterBox.x = 0
                clusterBox.y = y
                y += clusterBox.height + 10
            }
        }
        for (const component of this.viewContainer.children) {
            if (!clusterIds.has(component.cluster.id)) {
                this.viewContainer.removeChild(component)
            }
        }
        this.filter()

        for (const key of Object.keys(ALL_PODS)) {
            const pod = ALL_PODS[key]
            if (!this.seenPods.has(key)) {
                // pod was created
                this.seenPods.add(key)
                if (!this.bootstrapping && changes < 10) {
                    const globalPos = pod.toGlobal({x: 0, y: 0})
                    window.setTimeout(function () {
                        that.animatePodCreation(pod, globalPos)
                    }, 100 * changes)
                }
                changes++
            }
        }
    }

    zoomInto(element, zoom) {
        this.viewContainer.scale.set(zoom)

        const offsetx = window.innerWidth / 2 - (element.getGlobalPosition().x + (element.width / 2 * this.viewContainer.scale.x))
        const offsety = window.innerHeight / 2 - (element.getGlobalPosition().y + (element.height / 2 * this.viewContainer.scale.y))

        this.viewContainer.x += offsetx
        this.viewContainer.y += offsety
        // stop any current move animation
        this.viewContainerTargetPosition.x = this.viewContainer.x
        this.viewContainerTargetPosition.y = this.viewContainer.y

        this.clearMenus()
    }

    tick(time) {
        const deltaX = this.viewContainerTargetPosition.x - this.viewContainer.x
        const deltaY = this.viewContainerTargetPosition.y - this.viewContainer.y
        if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
            this.viewContainer.position.x = this.viewContainerTargetPosition.x
            this.viewContainer.position.y = this.viewContainerTargetPosition.y
        } else {
            if (Math.abs(deltaX) > time) {
                this.viewContainer.x += time * Math.sign(deltaX) * Math.max(10, Math.abs(deltaX) / 10)
            }
            if (Math.abs(deltaY) > time) {
                this.viewContainer.y += time * Math.sign(deltaY) * Math.max(10, Math.abs(deltaY) / 10)
            }
        }
        this.renderer.render(this.stage)
    }

    changeSorting(newSortFunction) {
        this.sorterFn = newSortFunction
        this.update()
    }

    switchTheme(newTheme) {
        this.theme = Theme.get(newTheme)
        this.draw()
        this.update()
        localStorage.setItem('theme', newTheme)
    }

    toggleCluster(clusterId) {
        if (this.selectedClusters.has(clusterId)) {
            this.selectedClusters.delete(clusterId)
        } else {
            this.selectedClusters.add(clusterId)
        }
        this.changeLocationHash('clusters', Array.from(this.selectedClusters).join(','))
        // make sure we are updating our EventSource filter
        this.connect()
        this.update()
    }

    keepAlive() {
        if (this.keepAliveTimer != null) {
            clearTimeout(this.keepAliveTimer)
        }
        this.keepAliveTimer = setTimeout(this.connect.bind(this), this.config.keepAliveSeconds * 1000)
        if (this.connectTime != null) {
            const now = Date.now()
            if (now - this.connectTime > this.config.maxConnectionLifetimeSeconds * 1000) {
                // maximum connection lifetime exceeded => reconnect
                this.connect()
            }
        }
    }

    pruneUnavailableClusters() {
        let updateNeeded = false
        const nowSeconds = Date.now() / 1000
        for (const [clusterId, statusObj] of this.clusterStatuses.entries()) {
            const lastQueryTime = statusObj.last_query_time || 0
            if (lastQueryTime < nowSeconds - this.config.maxDataAgeSeconds) {
                this.clusters.delete(clusterId)
                updateNeeded = true
            } else if (lastQueryTime < nowSeconds - 20) {
                updateNeeded = true
            }
        }
        if (updateNeeded) {
            this.update()
        }
    }

    disconnect() {
        if (this.eventSource != null) {
            this.eventSource.close()
            this.eventSource = null
            this.connectTime = null
        }
    }

    refreshLastQueryTime(clusterId) {
        let statusObj = this.clusterStatuses.get(clusterId)
        if (!statusObj) {
            statusObj = {}
        }
        statusObj.last_query_time = Date.now() / 1000
        this.clusterStatuses.set(clusterId, statusObj)
    }

    connect() {
        // first close the old connection
        this.disconnect()
        const that = this
        // NOTE: path must be relative to work with kubectl proxy out of the box
        let url = 'events'
        const clusterIds = Array.from(this.selectedClusters).join(',')
        if (clusterIds) {
            url += '?cluster_ids=' + clusterIds
        }
        const eventSource = this.eventSource = new EventSource(url, {credentials: 'include'})
        this.keepAlive()
        eventSource.onerror = function (_event) {
            that._errors++
            if (that._errors <= 1) {
                // immediately reconnect on first error
                that.connect()
            } else {
                // rely on keep-alive timer to reconnect
                that.disconnect()
            }
        }
        eventSource.addEventListener('clusterupdate', function (event) {
            that._errors = 0
            that.keepAlive()
            const cluster = JSON.parse(event.data)
            const status = that.clusterStatuses.get(cluster.id)
            const nowSeconds = Date.now() / 1000
            if (status && status.last_query_time < nowSeconds - that.config.maxDataAgeSeconds) {
                // outdated data => ignore
            } else {
                that.clusters.set(cluster.id, cluster)
                that.update()
            }
        })
        eventSource.addEventListener('clusterdelta', function (event) {
            that._errors = 0
            that.keepAlive()
            const data = JSON.parse(event.data)
            // we received some delta => we know that the cluster query succeeded!
            that.refreshLastQueryTime(data.cluster_id)
            let cluster = that.clusters.get(data.cluster_id)
            if (cluster && data.delta) {
                // deep copy cluster object (patch function mutates inplace!)
                cluster = JSON.parse(JSON.stringify(cluster))
                cluster = JSON_delta.patch(cluster, data.delta)
                that.clusters.set(cluster.id, cluster)
                that.update()
            }
        })
        eventSource.addEventListener('clusterstatus', function (event) {
            that._errors = 0
            that.keepAlive()
            const data = JSON.parse(event.data)
            that.clusterStatuses.set(data.cluster_id, data.status)
        })
        eventSource.addEventListener('bootstrapend', function (_event) {
            that._errors = 0
            that.keepAlive()
            that.bootstrapping = false
        })
        this.connectTime = Date.now()
    }

    run() {
        this.initialize()
        this.draw()
        this.connect()

        PIXI.ticker.shared.add(this.tick, this)
    }
}

/**
 * Setting this to true will prevent the global event handlers from
 * intercepting an event. This is used to stop native event handlers
 * from Pixi.js event handlers.
 * @type {boolean}
 */
App.stopGlobalEvents = false
