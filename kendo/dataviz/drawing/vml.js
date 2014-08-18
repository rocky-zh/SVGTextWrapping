(function(f, define){
    define([ "./shapes" ], f);
})(function(){

(function ($) {

    // Imports ================================================================
    var doc = document,

        kendo = window.kendo,
        deepExtend = kendo.deepExtend,

        dataviz = kendo.dataviz,
        defined = dataviz.defined,
        renderTemplate = dataviz.renderTemplate,

        d = dataviz.drawing,
        BaseNode = d.BaseNode,

        util = dataviz.util,
        renderAllAttr = util.renderAllAttr;

    // Constants ==============================================================
    var NONE = "none",
        TRANSPARENT = "transparent";

    // VML rendering surface ==================================================
    var Surface = d.Surface.extend({
        init: function(container, options) {
            d.Surface.fn.init.call(this);

            this.options = deepExtend({}, this.options, options);
            this.bind(this.events, this.options);

            this._root = new RootNode();
            this._click = this._handler("click");
            this._mouseenter = this._handler("mouseenter");
            this._mouseleave = this._handler("mouseleave");

            this._appendTo(container);
        },

        events: [
            "click",
            "mouseenter",
            "mouseleave"
        ],

        draw: function(element) {
            var surface = this;
            surface._root.load([element]);

            if (kendo.support.browser.version < 8) {
                setTimeout(function() {
                    surface.element.style.display = "block";
                }, 0);
            }
        },

        clear: function() {
            this._root.clear();

            if (kendo.support.browser.version < 8) {
                this.element.style.display = "none";
            }
        },

        _template: renderTemplate(
            "<div style='" +
                "width:#= kendo.dataviz.util.renderSize(d.options.width) #; " +
                "height:#= kendo.dataviz.util.renderSize(d.options.height) #; " +
                "position: absolute;'" +
            "><#= d._root.render() #/div>"
        ),

        _appendTo: function(container) {
            if (doc.namespaces) {
                doc.namespaces.add("kvml", "urn:schemas-microsoft-com:vml", "#default#VML");
            }

            container.innerHTML = this._template(this);
            this.element = container.firstChild;

            this._root.attachTo(this.element);

            var element = $(this.element);
            element.on("click", this._click);
            element.on("mouseover", this._mouseenter);
            element.on("mouseout", this._mouseleave);
        }
    });

    // SVG Node ================================================================
    var Node = BaseNode.extend({
        load: function(elements) {
            var node = this,
                element = node.element,
                childNode,
                srcElement,
                children,
                i;

            for (i = 0; i < elements.length; i++) {
                srcElement = elements[i];
                children = srcElement.children;

                if (srcElement instanceof d.Group) {
                    childNode = new GroupNode(srcElement);
                } else if (srcElement instanceof d.Path) {
                    childNode = new PathNode(srcElement);
                } else if (srcElement instanceof d.MultiPath) {
                    childNode = new MultiPathNode(srcElement);
                } else if (srcElement instanceof d.Circle) {
                    childNode = new CircleNode(srcElement);
                }

                if (children && children.length > 0) {
                    childNode.load(children);
                }

                node.append(childNode);

                if (element) {
                    childNode.attachTo(element);
                }
            }
        },

        attachTo: function(domElement) {
            var container = doc.createElement("div");

            container.style.display = "none";
            doc.body.appendChild(container);
            container.innerHTML = this.render();

            var element = container.firstChild;
            if (element) {
                domElement.appendChild(element);
                this.setElement(element);
            }

            doc.body.removeChild(container);
        },

        setElement: function(element) {
            var nodes = this.childNodes,
                childElement,
                i;

            if (this.element) {
                this.element._kendoNode = null;
            }

            this.element = element;
            element._kendoNode = this;

            for (i = 0; i < nodes.length; i++) {
                childElement = element.childNodes[i];
                nodes[i].setElement(childElement);
            }
        },

        template: renderTemplate(
            "#= d.renderChildren() #"
        ),

        render: function() {
            return this.template(this);
        },

        renderChildren: function() {
            var nodes = this.childNodes,
                output = "",
                i;

            for (i = 0; i < nodes.length; i++) {
                output += nodes[i].render();
            }

            return output;
        },

        clear: function() {
            var element = this.element;

            if (element) {
                element.parentNode.removeChild(element);
                this.element = null;
            }

            BaseNode.fn.clear.call(this);
        },

        attr: function(name, value) {
            if (this.element) {
                this.element[name] = value;
            }
        },

        allAttr: function(attrs) {
            for (var i = 0; i < attrs.length; i++) {
                this.attr(attrs[i][0], attrs[i][1]);
            }
        },

        css: function(name, value) {
            if (this.element) {
                this.element.style[name] = value;
            }
        }
    });

    var RootNode = Node.extend({
        attachTo: function(domElement) {
            this.element = domElement;
        },

        clear: BaseNode.fn.clear
    });

    var GroupNode = Node.extend({
        template: renderTemplate(
            "<div>#= d.renderChildren() #</div>"
        )
    });

    var StrokeNode = Node.extend({
        optionsChange: function(e) {
            if (e.field === "stroke") {
                this.allAttr(this.mapStroke(e.value));
            } else {
                var name = this.attributeMap[e.field];
                if (name) {
                    this.attr(name, e.value);
                }
            }

            this.invalidate();
        },

        attributeMap: {
            "stroke.color": "color",
            "stroke.width": "weight",
            "stroke.opacity": "opacity",
            "stroke.dashType": "dashstyle"
        },

        mapStroke: function(stroke) {
            var attrs = [];

            if (stroke) {
                attrs.push(["on", "true"]);
                attrs.push(["color", stroke.color]);
                attrs.push(["weight", stroke.width + "px"]);

                if (defined(stroke.opacity)) {
                    attrs.push(["opacity", stroke.opacity]);
                }

                if (defined(stroke.dashType)) {
                    attrs.push(["dashstyle", stroke.dashType]);
                }
            } else {
                attrs.push(["on", "false"]);
            }

            return attrs;
        },

        renderStroke: function() {
            return renderAllAttr(
                this.mapStroke(this.srcElement.options.stroke)
            );
        },

        template: renderTemplate(
            "<kvml:stroke #= d.renderStroke() #></kvml:stroke>"
        )
    });

    var FillNode = Node.extend({
        optionsChange: function(e) {
            switch(e.field) {
                case "fill":
                    this.allAttr(this.mapFill(e.value));
                    break;

                case "fill.color":
                    this.allAttr(this.mapFill({ color: e.value }));
                    break;

                default:
                    var name = this.attributeMap[e.field];
                    if (name) {
                        this.attr(name, e.value);
                    }
                    break;
            }

            this.invalidate();
        },

        attributeMap: {
            "fill.opacity": "opacity"
        },

        mapFill: function(fill) {
            var attrs = [];

            if (fill && fill.color !== TRANSPARENT) {
                attrs.push(["on", "true"]);
                attrs.push(["color", fill.color]);

                if (defined(fill.opacity)) {
                    attrs.push(["opacity", fill.opacity]);
                }
            } else {
                attrs.push(["on", "false"]);
            }

            return attrs;
        },

        renderFill: function() {
            return renderAllAttr(
                this.mapFill(this.srcElement.options.fill)
            );
        },

        template: renderTemplate(
            "<kvml:fill #= d.renderFill() #></kvml:fill>"
        )
    });

    var PathNode = Node.extend({
        init: function(srcElement) {
            this.fill = new FillNode(srcElement);
            this.stroke = new StrokeNode(srcElement);

            Node.fn.init.call(this, srcElement);

            this.append(this.fill);
            this.append(this.stroke);
        },

        geometryChange: function() {
            this.attr("v", this.renderData());
            this.invalidate();
        },

        optionsChange: function(e) {
            if (e.field === "visible") {
                this.css("display", e.value ? "block" : "none");
            } else if (e.field.indexOf("fill") === 0) {
                this.fill.optionsChange(e);
            } else if (e.field.indexOf("stroke") === 0) {
                this.stroke.optionsChange(e);
            }

            this.invalidate();
        },

        renderData: function() {
            return this.printPath(this.srcElement);
        },

        printPath: function(path, open) {
            var segments = path.segments;
            if (segments.length > 0) {
                var parts = [],
                    output,
                    i;

                for (i = 0; i < segments.length; i++) {
                    parts.push(segments[i].anchor.toString(0, ","));
                }

                output = "m " + parts.shift() + " l " + parts.join(" ");
                if (path.options.closed) {
                    output += " x";
                }

                if (open !== true) {
                    output += " e";
                }

                return output;
            }
        },

        mapFill: function(fill) {
            var attrs = [];

            if (fill && fill.color !== TRANSPARENT) {
                attrs.push(["fill", fill.color]);

                if (defined(fill.opacity)) {
                    attrs.push(["fill-opacity", fill.opacity]);
                }
            } else {
                attrs.push(["fill", NONE]);
            }

            return attrs;
        },

        renderCursor: function() {
            var cursor = this.srcElement.options.cursor;

            if (cursor) {
                return "cursor:" + cursor + ";";
            }

            return "";
        },

        renderVisibility: function() {
            if (this.srcElement.options.visible === false) {
                return "display:none;";
            }

            return "";
        },

        renderCoordsize: function() {
            var scale = this.srcElement.options.align === false ? 10000 : 1;
            return "coordsize='" + scale + " " + scale + "'";
        },

        renderSize: function() {
            var scale = this.srcElement.options.align === false ? 100 : 1;
            return "width:" + scale + "px;height:" + scale + "px;";
        },

        template: renderTemplate(
            "<kvml:shape " +
            "style='position:absolute;" +
            "#= d.renderSize() # " +
            "#= d.renderVisibility() # " +
            "#= d.renderCursor() #' " +
            "coordorigin='0 0' #= d.renderCoordsize() #>" +
                "#= d.renderChildren() #" +
                "<kvml:path #= kendo.dataviz.util.renderAttr('v', d.renderData()) # />" +
            "</kvml:shape>"
        )
    });

    var MultiPathNode = PathNode.extend({
        renderData: function() {
            var paths = this.srcElement.paths;

            if (paths.length > 0) {
                var result = [],
                    i,
                    open;

                for (i = 0; i < paths.length; i++) {
                    open = i < paths.length - 1;
                    result.push(this.printPath(paths[i], open));
                }

                return result.join(" ");
            }
        }
    });

    var CircleNode = PathNode.extend({
        geometryChange: function() {
            var radius = this.radius();
            var center = this.center();
            var diameter = radius * 2;

            this.css("left", center.x - radius + "px");
            this.css("top", center.y - radius + "px");
            this.css("width", diameter + "px");
            this.css("height", diameter + "px");
            this.invalidate();
        },

        center: function() {
            return this.srcElement.geometry.center;
        },

        radius: function() {
            return this.srcElement.geometry.radius;
        },

        template: renderTemplate(
            "<kvml:oval " +
            "style='position:absolute;" +
            "#= d.renderVisibility() #" +
            "#= d.renderCursor() #" +
            "width:#= d.radius() * 2 #px;height:#= d.radius() * 2 #px;" +
            "top:#= d.center().y - d.radius() #px;" +
            "left:#= d.center().x - d.radius() #px;'>" +
                "#= d.renderChildren() #" +
            "</kvml:oval>"
        )
    });

    // Exports ================================================================
    if (kendo.support.browser.msie) {
        d.SurfaceFactory.current.register("vml", Surface, 20);
    }

    deepExtend(d, {
        vml: {
            CircleNode: CircleNode,
            FillNode: FillNode,
            GroupNode: GroupNode,
            MultiPathNode: MultiPathNode,
            Node: Node,
            PathNode: PathNode,
            RootNode: RootNode,
            StrokeNode: StrokeNode,
            Surface: Surface
        }
    });

})(window.kendo.jQuery);

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
