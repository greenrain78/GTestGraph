function getColorByText(text) {

    if (text.startsWith("sample")) {
        return "#B3E5FC"; // sample 그룹 색상 (스카이 블루)
    }
    

    const colorMap = {
        "Test Runner": "#FFCDD2", // 연한 빨강
        "Test": "#F8BBD0", // 연한 핑크


        "sample2": "#E1BEE7", // 연한 보라
        "sample3": "#D1C4E9", // 연한 퍼플
        "sample4": "#C5CAE9", // 연한 블루
        "sample5": "#BBDEFB", // 밝은 블루
        "sample6": "#B3E5FC", // 스카이 블루
        "sample7": "#B2EBF2", // 청록색
        "sample8": "#B2DFDB", // 연한 그린
        "sample9": "#C8E6C9", // 라이트 그린
        "sample10": "#DCEDC8" // 연한 노랑
    };
    return colorMap[text] || "#E0E0E0"; // 매핑된 색이 없으면 기본 색상 - 회색
}

function initDiagram(data) {
    var $ = go.GraphObject.make;
    var myDiagram = $(go.Diagram, "myDiagramDiv", {
        "undoManager.isEnabled": true,
        initialAutoScale: go.AutoScale.Uniform,
        contentAlignment: go.Spot.Center,
        layout: new go.ForceDirectedLayout({
            defaultElectricalCharge: 300,
            defaultSpringLength: 150
        })
    });

    // 노드 템플릿 설정
    myDiagram.nodeTemplate = $(go.Node, "Auto",
        { locationSpot: go.Spot.Center },
        $(go.Shape, "RoundedRectangle", {
            stroke: "#9E9E9E",
            strokeWidth: 2,
            shadowVisible: true
        }, new go.Binding("fill", "", function (node) {
            return node.color || getColorByText(node.text);
        })),
        $(go.TextBlock, {
            font: "600 14pt 'Poppins', sans-serif",
            stroke: "#000000",
            margin: 12,
            textAlign: "center",
            wrap: go.TextBlock.WrapFit,
            minSize: new go.Size(60, 35),
            maxSize: new go.Size(NaN, 220)
        }, new go.Binding("text", "text")),
        {
            click: function (e, node) {
                var url = node.data.url;
                if (url) {
                    window.location.href = url;
                }
            }
        }
    );

    // 링크 템플릿 설정
    myDiagram.linkTemplate = $(go.Link,
        { curve: go.Link.Bezier, toShortLength: 4 },
        $(go.Shape, { stroke: "#9E9E9E", strokeWidth: 2, strokeDashArray: [4, 2] }),
        $(go.Shape, { toArrow: "Standard", stroke: "#757575", fill: "#78909C" }),
        $(go.Panel, "Auto", // 추후 제거
            $(go.Shape, {
                fill: "rgba(224, 224, 224, 0.9)",
                stroke: "#1E272E",
                strokeWidth: 1,
                shadowVisible: true
            }),
            $(go.TextBlock, {
                textAlign: "center",
                font: "italic 12pt 'Poppins', sans-serif",
                stroke: "#000000",
                margin: 6
            }, new go.Binding("text", "text"))
        )
    );

    // JSON 데이터 설정
    myDiagram.model = new go.GraphLinksModel(data.nodeDataArray, data.linkDataArray);
}

// JSON 파일 로드 함수
function loadJSON(file) {
    fetch(file)
        .then(response => response.json())
        .then(data => initDiagram(data))
        .catch(error => console.error("JSON 로드 실패:", error));
}

// URL에서 데이터 파일 지정
function getDataFile() {
    const params = new URLSearchParams(window.location.search);
    return params.get("data") || "data.json";
}

// JSON 데이터 로드 및 다이어그램 초기화
loadJSON(getDataFile());
