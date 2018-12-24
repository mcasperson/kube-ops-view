import App from './app'

const PIXI = require('pixi.js')

export default class Button extends PIXI.Graphics
{
    constructor(value, onClick)
    {
        super()

        this.interactive = true
        this.buttonMode = true

        this.value = value
        this.onClick = onClick

        this.text = new PIXI.Text(this.value, {
            fontFamily: 'ShareTechMono',
            fontSize: 14,
            fill: App.current.theme.primaryColor,
            align: 'center'
        })
        this.text.x = 5
        this.text.y = 5
        this.addChild(this.text)
    }

    onBackOver() {
        this.alpha = 0.5
    }

    onBackOut() {
        this.alpha = 1
    }

    draw() {
        const button = this

        // FIXME: hardcoded value for average char width..
        const textBoxWidth = 7 + 8 * this.value.length

        // draw a triangle
        button.lineStyle(1, App.current.theme.primaryColor, 1)
        button.drawRect(0, 0, textBoxWidth, 22)

        button.on('mousedown', button.onClick.bind(this))
        button.on('touchstart', button.onClick.bind(this))
        button.on('mouseover', button.onBackOver.bind(this))
        button.on('mouseout', button.onBackOut.bind(this))

        return button
    }
}