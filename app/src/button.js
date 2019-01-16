import App from './app'

const PIXI = require('pixi.js')

export default class Button extends PIXI.Graphics
{
    constructor(value, onClick, fontSize)
    {
        super()

        this.interactive = true
        this.buttonMode = true

        this.value = value
        this.onClick = onClick
        this.fontSize = fontSize || 14
    }

    destroy(options) {
        this.clear()
        super.destroy(options)
    }

    onBackOver() {
        this.alpha = 0.5
    }

    onBackOut() {
        this.alpha = 1
    }

    draw() {
        this.children.forEach(child => child.destroy(true))
        this.removeChildren()
        this.clear()

        const button = this

        this.text = new PIXI.Text(this.value, {
            fontFamily: 'ShareTechMono',
            fontSize: this.fontSize,
            fill: App.current.theme.primaryColor,
            align: 'center'
        })
        this.text.x = 5
        this.text.y = 5
        this.addChild(this.text)

        // FIXME: hardcoded value for average char width..
        const textBoxWidth = 7 + .55 * this.fontSize * this.value.length
        const textBoxHeight = this.fontSize + 8

        // draw a triangle
        button.lineStyle(1, App.current.theme.primaryColor, 1)
        button.drawRect(0, 0, textBoxWidth, textBoxHeight)

        button.on('mousedown', button.onClick.bind(this))
        button.on('touchstart', button.onClick.bind(this))
        button.on('mouseover', button.onBackOver.bind(this))
        button.on('mouseout', button.onBackOut.bind(this))

        return button
    }
}