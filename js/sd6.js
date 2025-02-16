

function ensureLifelineHeights(e) {
    // iterate over all Activities (ignore Groups)
    const arr = myDiagram.model.nodeDataArray;
    let max = -1;
    for (let i = 0; i < arr.length; i++) {
        const act = arr[i];
        if (act.isGroup) continue;
        max = Math.max(max, act.start + act.duration);
    }
    if (max > 0) {
        // now iterate over only Groups
        for (let i = 0; i < arr.length; i++) {
            const gr = arr[i];
            if (!gr.isGroup) continue;
            if (max > gr.duration) {
                // this only extends, never shrinks
                myDiagram.model.setDataProperty(gr, 'duration', max);
            }
        }
    }
}

// some parameters
const LinePrefix = 20; // vertical starting point in document for all Messages and Activations
const LineSuffix = 30; // vertical length beyond the last message time
const MessageSpacing = 20; // vertical distance between Messages at different steps
const ActivityWidth = 10; // width of each vertical activity bar
const ActivityStart = 5; // height before start message time
const ActivityEnd = 5; // height beyond end message time

function computeLifelineHeight(duration) {
    return LinePrefix + duration * MessageSpacing + LineSuffix;
}

function computeActivityLocation(act) {
    const groupdata = myDiagram.model.findNodeDataForKey(act.group);
    if (groupdata === null) return new go.Point();
    // get location of Lifeline's starting point
    const grouploc = go.Point.parse(groupdata.loc);
    return new go.Point(grouploc.x, convertTimeToY(act.start) - ActivityStart);
}
function backComputeActivityLocation(loc, act) {
    myDiagram.model.setDataProperty(act, 'start', convertYToTime(loc.y + ActivityStart));
}

function computeActivityHeight(duration) {
    return ActivityStart + duration * MessageSpacing + ActivityEnd;
}
function backComputeActivityHeight(height) {
    return (height - ActivityStart - ActivityEnd) / MessageSpacing;
}

// time is just an abstract small non-negative integer
// here we map between an abstract time and a vertical position
function convertTimeToY(t) {
    return t * MessageSpacing + LinePrefix;
}
function convertYToTime(y) {
    return (y - LinePrefix) / MessageSpacing;
}

// a custom routed Link
class MessageLink extends go.Link {
    constructor(init) {
        super();
        this.time = 0; // use this "time" value when this is the temporaryLink
        if (init) Object.assign(this, init);
    }

    getLinkPoint(node, port, spot, from, ortho, othernode, otherport) {
        const p = port.getDocumentPoint(go.Spot.Center);
        const r = port.getDocumentBounds();
        const op = otherport.getDocumentPoint(go.Spot.Center);

        const data = this.data;
        const time = data !== null ? data.time : this.time; // if not bound, assume this has its own "time" property

        const aw = this.findActivityWidth(node, time);
        const x = op.x > p.x ? p.x + aw / 2 : p.x - aw / 2;
        const y = convertTimeToY(time);
        return new go.Point(x, y);
    }

    findActivityWidth(node, time) {
        let aw = ActivityWidth;
        if (node instanceof go.Group) {
            // see if there is an Activity Node at this point -- if not, connect the link directly with the Group's lifeline
            if (
                !node.memberParts.any((mem) => {
                    const act = mem.data;
                    return act !== null && act.start <= time && time <= act.start + act.duration;
                })
            ) {
                aw = 0;
            }
        }
        return aw;
    }

    getLinkDirection(node, port, linkpoint, spot, from, ortho, othernode, otherport) {
        const p = port.getDocumentPoint(go.Spot.Center);
        const op = otherport.getDocumentPoint(go.Spot.Center);
        const right = op.x > p.x;
        return right ? 0 : 180;
    }

    computePoints() {
        if (this.fromNode === this.toNode) {
            // also handle a reflexive link as a simple orthogonal loop
            const data = this.data;
            const time = data !== null ? data.time : this.time; // if not bound, assume this has its own "time" property
            const p = this.fromNode.port.getDocumentPoint(go.Spot.Center);
            const aw = this.findActivityWidth(this.fromNode, time);

            const x = p.x + aw / 2;
            const y = convertTimeToY(time);
            this.clearPoints();
            this.addPoint(new go.Point(x, y));
            this.addPoint(new go.Point(x + 50, y));
            this.addPoint(new go.Point(x + 50, y + 5));
            this.addPoint(new go.Point(x, y + 5));
            return true;
        } else {
            return super.computePoints();
        }
    }
}
class MessagingTool extends go.LinkingTool {
    constructor(init) {
        super();
        this.temporaryLink = new MessageLink()
            .add(
                new go.Shape('Rectangle', { stroke: 'magenta', strokeWidth: 2 }),
                new go.Shape({ toArrow: 'OpenTriangle', stroke: 'magenta' })
            );
        if (init) Object.assign(this, init);
    }

    doActivate() {
        super.doActivate();
        const time = convertYToTime(this.diagram.firstInput.documentPoint.y);
        this.temporaryLink.time = Math.ceil(time); // round up to an integer value
    }

    insertLink(fromnode, fromport, tonode, toport) {
        const newlink = super.insertLink(fromnode, fromport, tonode, toport);
        if (newlink !== null) {
            const model = this.diagram.model;
            // specify the time of the message
            const start = this.temporaryLink.time;
            const duration = 1;
            newlink.data.time = start;
            model.setDataProperty(newlink.data, 'text', 'msg');
            // and create a new Activity node data in the "to" group data
            const newact = {
                group: newlink.data.to,
                start: start,
                duration: duration
            };
            model.addNodeData(newact);
            // now make sure all Lifelines are long enough
            ensureLifelineHeights();
        }
        return newlink;
    }
}
class MessageDraggingTool extends go.DraggingTool {
    constructor(init) {
        super();
        if (init) Object.assign(this, init);
    }

    // override the standard behavior to include all selected Links,
    // even if not connected with any selected Nodes
    computeEffectiveCollection(parts, options) {
        const result = super.computeEffectiveCollection(parts, options);
        // add a dummy Node so that the user can select only Links and move them all
        result.add(new go.Node(), new go.DraggingInfo(new go.Point()));
        // normally this method removes any links not connected to selected nodes;
        // we have to add them back so that they are included in the "parts" argument to moveParts
        parts.each((part) => {
            if (part instanceof go.Link) {
                result.add(part, new go.DraggingInfo(part.getPoint(0).copy()));
            }
        });
        return result;
    }

    // override to allow dragging when the selection only includes Links
    mayMove() {
        return !this.diagram.isReadOnly && this.diagram.allowMove;
    }

    // override to move Links (which are all assumed to be MessageLinks) by
    // updating their Link.data.time property so that their link routes will
    // have the correct vertical position
    moveParts(parts, offset, check) {
        super.moveParts(parts, offset, check);
        const it = parts.iterator;
        while (it.next()) {
            if (it.key instanceof go.Link) {
                const link = it.key;
                const startY = it.value.point.y; // DraggingInfo.point.y
                let y = startY + offset.y; // determine new Y coordinate value for this link
                const cellY = this.gridSnapCellSize.height;
                y = Math.round(y / cellY) * cellY; // snap to multiple of gridSnapCellSize.height
                const t = Math.max(0, convertYToTime(y));
                link.diagram.model.set(link.data, 'time', t);
                link.invalidateRoute();
            }
        }
    }
}

function refresh_diagram() {
    document.getElementById("title").textContent = json_data.title;

    //setUp 데이터를 추가
    json_data.nodeDataArray = json_data.nodeDataArray.concat(
        json_data.setUp.nodeDataArray.map(node => ({
            ...node,
            start: node.hasOwnProperty("start") ? node.start + json_data.setUp.start : node.start
        }))
    );
    json_data.linkDataArray = json_data.linkDataArray.concat(
        json_data.setUp.linkDataArray.map(link => ({
            ...link,
            time: link.hasOwnProperty("time") ? link.time + json_data.setUp.start : link.time
        }))
    );
    //testBody 데이터를 추가
    json_data.nodeDataArray = json_data.nodeDataArray.concat(
        json_data.testBody.nodeDataArray.map(node => ({
            ...node,
            start: node.hasOwnProperty("start") ? node.start + json_data.testBody.start : node.start
        }))
    );
    json_data.linkDataArray = json_data.linkDataArray.concat(
        json_data.testBody.linkDataArray.map(link => ({
            ...link,
            time: link.hasOwnProperty("time") ? link.time + json_data.testBody.start : link.time
        }))
    );

    //tearDown 데이터를 추가
    json_data.nodeDataArray = json_data.nodeDataArray.concat(
        json_data.tearDown.nodeDataArray.map(node => ({
            ...node,
            start: node.hasOwnProperty("start") ? node.start + json_data.tearDown.start : node.start
        }))
    );
    json_data.linkDataArray = json_data.linkDataArray.concat(
        json_data.tearDown.linkDataArray.map(link => ({
            ...link,
            time: link.hasOwnProperty("time") ? link.time + json_data.tearDown.start : link.time
        }))
    );
    myDiagram.model = go.Model.fromJson(json_data);

}

function load() {
    const params = new URLSearchParams(window.location.search);
    const file = "/" + params.get("data") || "seq/data.json";

    fetch(file)
        .then(response => response.json())
        .then(data => {
            json_data = data;
            refresh_diagram();
            init_btn(json_data.param);
        })
        .catch(error => console.error("JSON 로드 실패:", error));
}
function init_btn(param) {
    console.log(param);
    const container = document.querySelector(".container");
    init_data =   {
        "PrimeTable": ["OnTheFlyPrimeTable", "PreCalculatedPrimeTable"]
      }
    const buttonsData = init_data.PrimeTable.map(text => ({ text: text }));
    buttonsData.forEach(data => {
        let button = document.createElement("button");
        button.textContent = data.text;
        button.classList.add("button", data.className);
        button.addEventListener("click", function() {
            if (window.selectedButton) {
                window.selectedButton.classList.remove("selected");
                window.selectedButton.disabled = false;
            }
            button.classList.add("selected");
            button.disabled = true;
            window.selectedButton = button;
            change_json_data("PrimeTable", button.textContent );
        });
        container.appendChild(button);

    });
}

function change_json_data(key, text) {
    json_data.nodeDataArray = json_data.nodeDataArray.map(node => 
        node.paramGroup === key ? { ...node, text: text } : node
    );
    myDiagram.model = go.Model.fromJson(json_data);
}      


function init() {
    myDiagram = new go.Diagram('myDiagramDiv', {
        allowCopy: false,
        linkingTool: new MessagingTool(), // defined below
        'resizingTool.isGridSnapEnabled': true,
        draggingTool: new MessageDraggingTool(), // defined below
        'draggingTool.gridSnapCellSize': new go.Size(1, MessageSpacing / 4),
        'draggingTool.isGridSnapEnabled': true,
        // automatically extend Lifelines as Activities are moved or resized
        SelectionMoved: ensureLifelineHeights,
        PartResized: ensureLifelineHeights,
        'undoManager.isEnabled': true
    });


    // define the Lifeline Node template.
    myDiagram.groupTemplate = new go.Group('Vertical', {
        locationSpot: go.Spot.Bottom,
        locationObjectName: 'HEADER',
        minLocation: new go.Point(0, 0),
        maxLocation: new go.Point(9999, 0),
        selectionObjectName: 'HEADER'
    })
        .bindTwoWay('location', 'loc', go.Point.parse, go.Point.stringify)
        .add(
            new go.Panel('Auto', { name: 'HEADER' })
                .add(
                    new go.Shape('Rectangle', {
                        fill: new go.Brush('Linear', {
                            0: '#bbdefb',
                            1: go.Brush.darkenBy('#bbdefb', 0.1)
                        }),
                        stroke: null
                    }),
                    new go.TextBlock({
                        margin: 5,
                        font: '400 10pt Source Sans Pro, sans-serif'
                    })
                        .bind('text')
                ),
            new go.Shape({
                figure: 'LineV',
                fill: null,
                stroke: 'gray',
                strokeDashArray: [3, 3],
                width: 1,
                alignment: go.Spot.Center,
                portId: '',
                fromLinkable: true,
                fromLinkableDuplicates: true,
                toLinkable: true,
                toLinkableDuplicates: true,
                cursor: 'pointer'
            })
                .bind('height', 'duration', computeLifelineHeight)
        );

    // define the Activity Node template
    myDiagram.nodeTemplate = new go.Node({
        locationSpot: go.Spot.Top,
        locationObjectName: 'SHAPE',
        minLocation: new go.Point(NaN, LinePrefix - ActivityStart),
        maxLocation: new go.Point(NaN, 19999),
        selectionObjectName: 'SHAPE',
        resizable: true,
        resizeObjectName: 'SHAPE',
        resizeAdornmentTemplate: new go.Adornment('Spot')
            .add(
                new go.Placeholder(),
                new go.Shape({ // only a bottom resize handle
                    alignment: go.Spot.Bottom,
                    cursor: 'col-resize',
                    desiredSize: new go.Size(6, 6),
                    fill: 'yellow'
                })
            )
    })
        .bindTwoWay('location', '', computeActivityLocation, backComputeActivityLocation)
        .add(
            new go.Shape('Rectangle', {
                name: 'SHAPE',
                fill: 'white',
                stroke: 'black',
                width: ActivityWidth,
                // allow Activities to be resized down to 1/4 of a time unit
                minSize: new go.Size(ActivityWidth, computeActivityHeight(0.25))
            })
                .bindTwoWay('height', 'duration', computeActivityHeight, backComputeActivityHeight)
        );

    // define the Message Link template.
    myDiagram.linkTemplate = new MessageLink({ // defined below
        selectionAdorned: true,
        curviness: 0
    })
        .add(
            new go.Shape('Rectangle', { stroke: 'black' }),
            new go.Shape({ toArrow: 'OpenTriangle', stroke: 'black' }),
            new go.TextBlock({
                font: '400 9pt Source Sans Pro, sans-serif',
                segmentIndex: 0,
                segmentOffset: new go.Point(NaN, NaN),
                isMultiline: false,
                editable: true
            })
                .bindTwoWay('text')
        );

    // create the graph by reading the JSON data saved in "mySavedModel" textarea element
    load();
}

window.addEventListener('DOMContentLoaded', init);