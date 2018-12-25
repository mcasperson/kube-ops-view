import Button from './button'
import App from './app'

const PIXI = require('pixi.js')

export const MENU_VERTICAL_PADDING = 10
export const MENU_HORIZONTAL_PADDING = 10

export default class Menu extends PIXI.Graphics {
    constructor(items) {
        super()
        this.items = items
    }

    draw() {
        this.items.reduce((verticalPos, item) => {
            const element = item.draw()
            this.addChild(element)
            element.x = MENU_HORIZONTAL_PADDING
            element.y = verticalPos
            return verticalPos + element.height + MENU_VERTICAL_PADDING
        }, MENU_VERTICAL_PADDING)

        this.beginFill(App.current.theme.secondaryColor, 1)
        this.drawRect(0, 0, this.width + MENU_HORIZONTAL_PADDING, this.height + MENU_VERTICAL_PADDING)
    }

    destroy() {
        super.destroy()
        this.removeChildren()
    }
}