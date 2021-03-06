import App from './app'
import Button from './button'

const PIXI = require('pixi.js')

export const MENU_VERTICAL_PADDING = 10
export const MENU_HORIZONTAL_PADDING = 10

export const ALL_MENUS = []

export default class Menu extends PIXI.Graphics {
    constructor(parentMenu) {
        super()
        this.items = []
        this.parentMenu = parentMenu
        this.visible = false
        ALL_MENUS.push(this)
    }

    draw() {
        this.children
            .filter(child => this.items.indexOf(child) === -1)
            .forEach(child => child.destroy(true))
        this.removeChildren()
        if (this.graphicsData) {
            this.clear()
        }

        const that = this
        this.items.reduce((verticalPos, item) => {
            const element = item.draw()
            that.addChild(element)
            element.x = MENU_HORIZONTAL_PADDING
            element.y = verticalPos
            return verticalPos + element.height + MENU_VERTICAL_PADDING
        }, MENU_VERTICAL_PADDING)

        this.beginFill(App.current.theme.secondaryColor, 1)
        this.drawRect(0, 0, this.width + MENU_HORIZONTAL_PADDING, this.height + MENU_VERTICAL_PADDING)
    }

    destroy(options) {
        if (this.parent) {
            this.parent.removeChild(this)
        }
        if (this.graphicsData) {
            this.clear()
            super.destroy(options)
        }
        ALL_MENUS.splice(ALL_MENUS.indexOf(this), 1)
    }

    addButton(label, callback) {
        this.items.push(new Button(label, callback, 20))
        return this
    }

    addSubMenu(label, buildMenu) {
        const that = this
        const subMenu = new Menu(this)
        buildMenu(subMenu)
        this.addButton(label, function() {
            subMenu.showMenu(
                that.getGlobalPosition().x + that.width,
                this.getGlobalPosition().y)
            App.stopGlobalEvents = true
        })
        return this
    }

    showMenu(x, y) {
        ALL_MENUS.forEach(menu => {
            menu.visible = this.isMeOrParent(menu)
        })
        this.x = x
        this.y = y
    }

    isMeOrParent(menu) {
        if (menu === this) {
            return true
        }

        if (this.parentMenu) {
            return this.parentMenu.isMeOrParent(menu)
        }

        return false
    }
}