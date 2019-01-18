import App from './app'

const PIXI = require('pixi.js')

export default class SelectBox extends PIXI.Graphics {
    constructor(items, value, onchange) {
        super()
        this.items = items
        this.value = value
        this.onchange = onchange

        this.textItems = items.map(item => {
            const text = new PIXI.Text(item.text, {
                fontFamily: 'ShareTechMono',
                fontSize: 14,
                fill: App.current.theme.primaryColor,
                align: 'center'
            })
            text.x = 10
            text.y = 5
            return text
        })
    }

    destroy(options) {
        if (this.graphicsData) {
            this.clear()
            super.destroy(options)
        }
    }

    onForwardOver() {
        this.forwardArrow.alpha = 0.5
    }

    onForwardOut() {
        this.forwardArrow.alpha = 1
    }

    onForwardPressed() {
        const selectBox = this
        selectBox.count++
        if (selectBox.count >= this.items.length) {
            selectBox.count = 0
        }
        this.value = this.items[this.count].value
        this.onchange(this.value)
        this.draw()
    }

    onBackOver() {
        this.backArrow.alpha = 0.5
    }

    onBackOut() {
        this.backArrow.alpha = 1
    }

    onBackPressed() {
        const selectBox = this
        selectBox.count--
        if (selectBox.count < 0) {
            selectBox.count = selectBox.items.length - 1
        }
        this.value = this.items[this.count].value
        this.onchange(this.value)
        this.draw()
    }

    draw() {
        this.children
            .filter(child => this.textItems.indexOf(child) === -1)
            .forEach(child => child.destroy(true))
        this.removeChildren()
        if (this.graphicsData) {
            this.clear()
        }

        const selectBox = this

        this.count = 0
        for (const item of this.items) {
            if (item.value === this.value) {
                break
            }
            this.count++
        }
        if (this.count >= this.items.length) {
            this.count = 0
        }

        this.addChild(this.textItems[this.count])

        const backArrow = this.backArrow = new PIXI.Graphics()
        const forwardArrow = this.forwardArrow = new PIXI.Graphics()
        backArrow.interactive = true
        backArrow.buttonMode = true
        forwardArrow.interactive = true
        forwardArrow.buttonMode = true

        // FIXME: hardcoded value for average char width..
        const textBoxWidth = 10 + 8 * Math.max.apply(Math, this.items.map(item => item.text.length))
        const arrowBoxWidth = 18

        // draw a triangle
        backArrow.beginFill(App.current.theme.secondaryColor, 1)
        backArrow.drawRect(-18, 0, arrowBoxWidth, 22)
        backArrow.lineStyle(1, App.current.theme.primaryColor, 1)
        backArrow.beginFill(App.current.theme.secondaryColor, 1)
        backArrow.moveTo(-4, 5)
        backArrow.lineTo(-15, 11)
        backArrow.lineTo(-4, 17)
        backArrow.lineTo(-4, 5)
        backArrow.endFill()
        selectBox.addChild(backArrow)

        selectBox.lineStyle(1, App.current.theme.primaryColor, 1)
        selectBox.drawRect(4, 0, textBoxWidth, 22)

        forwardArrow.beginFill(App.current.theme.secondaryColor, 1)
        forwardArrow.drawRect(textBoxWidth + 8, 0, arrowBoxWidth, 22)
        forwardArrow.lineStyle(1, App.current.theme.primaryColor, 1)
        forwardArrow.beginFill(App.current.theme.secondaryColor, 1)
        forwardArrow.moveTo(textBoxWidth + 11, 5)
        forwardArrow.lineTo(textBoxWidth + 22, 11)
        forwardArrow.lineTo(textBoxWidth + 11, 17)
        forwardArrow.lineTo(textBoxWidth + 11, 5)
        forwardArrow.endFill()
        selectBox.addChild(forwardArrow)

        backArrow.on('mouseover', selectBox.onBackOver.bind(this))
        backArrow.on('mouseout', selectBox.onBackOut.bind(this))
        backArrow.on('mousedown', selectBox.onBackPressed.bind(this))
        backArrow.on('touchstart', selectBox.onBackPressed.bind(this))
        forwardArrow.on('mouseover', selectBox.onForwardOver.bind(this))
        forwardArrow.on('mouseout', selectBox.onForwardOut.bind(this))
        forwardArrow.on('mousedown', selectBox.onForwardPressed.bind(this))
        forwardArrow.on('touchstart', selectBox.onForwardPressed.bind(this))

        return selectBox
    }

}

