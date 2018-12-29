import App from './app'

const PIXI = require('pixi.js')
const TIME_TO_LIVE = 2000
const TOAST_VERTICAL_MARGIN = 30
const TOAST_HORIZONTAL_MARGIN = 30
const TOAST_VERTICAL_PADDING = 10
const TOAST_HORIZONTAL_PADDING = 10

export default class Toast extends PIXI.Graphics
{
    constructor(value)
    {
        super()

        this.interactive = true

        this.startTime = new Date().getTime()
        this.value = value

        this.text = new PIXI.Text(this.value, {
            fontFamily: 'ShareTechMono',
            fontSize: 14,
            fill: App.current.theme.primaryColor,
            align: 'center'
        })
        this.text.x = TOAST_HORIZONTAL_PADDING
        this.text.y = TOAST_VERTICAL_PADDING
        this.addChild(this.text)

        PIXI.ticker.shared.add(this.tick, this)
    }

    destroy() {
        if (this.parent) {
            this.parent.removeChild(this)
        }
        PIXI.ticker.shared.remove(this.tick, this)
        super.destroy()
    }

    tick() {
        if (new Date().getTime() - this.startTime > TIME_TO_LIVE) {
            this.destroy()
        }
    }

    onBackOver() {
        this.alpha = 0.5
    }

    onBackOut() {
        this.alpha = 1
    }

    draw() {
        const toast = this

        // FIXME: hardcoded value for average char width..
        const textBoxWidth = TOAST_HORIZONTAL_PADDING + 8 * this.value.length
        const textBoxHeight = 12 + TOAST_VERTICAL_PADDING * 2

        toast.lineStyle(1, App.current.theme.primaryColor, 1)
        toast.beginFill(App.current.theme.secondaryColor, 1)
        toast.drawRect(0, 0, textBoxWidth, textBoxHeight)

        toast.on('mouseover', toast.onBackOver.bind(this))
        toast.on('mouseout', toast.onBackOut.bind(this))

        this.x = window.innerWidth - toast.width - TOAST_HORIZONTAL_MARGIN
        this.y = window.innerHeight - toast.height - TOAST_VERTICAL_MARGIN

        toast.hitArea = new PIXI.Rectangle(0, 0, toast.width, toast.height)

        return toast
    }
}