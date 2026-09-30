pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls.Basic as Controls
import QtQuick.Effects

Rectangle {
    id: root
    width: 1920
    height: 1080
    color: backgroundColor

    readonly property color backgroundColor: config.background || "#1B1D24"
    readonly property color surfaceColor: config.surface || "#272A34"
    readonly property color ruleColor: config.rule || "#3B404E"
    readonly property color foregroundColor: config.foreground || "#DCDDE5"
    readonly property color mutedColor: config.muted || "#A0A4B5"
    readonly property color accentColor: config.accent || "#64D6A5"
    readonly property color alertColor: config.alert || "#F7768E"
    readonly property string fontFamily: config.fontFamily || "JetBrainsMono Nerd Font"
    // Icons come from the proportional Nerd Font, as in the Quickshell bar.
    readonly property string glyphFamily: fontFamily + " Propo"
    // Desktop palette body text is smaller; login fields stay readable at a distance.
    readonly property int formSize: Math.max(16, Number(config.fontSize) || 18)
    readonly property int hintSize: 16
    readonly property int cardRadius: Number(config.cardRadius) || 14
    readonly property int inputRadius: Number(config.inputRadius) || 8
    // Bar and control radii follow DESIGN.md: base + 3 and base × 0.7.
    readonly property int groupRadius: inputRadius + 3
    readonly property int controlRadius: Math.round(inputRadius * 0.7)
    readonly property int clockSize: Number(config.clockSize) || 72
    readonly property bool effectsAvailable: GraphicsInfo.api !== GraphicsInfo.Software
    property date now: new Date()
    property bool busy: false
    property string failure: ""
    property string pendingPower: ""
    property Item powerOrigin: null

    // Material Design glyphs from the Nerd Font; the same set as the bar.
    readonly property var glyphs: ({
        monitor: "\u{F0379}",
        chevronUp: "\u{F0143}",
        sleep: "\u{F04B2}",
        restart: "\u{F0709}",
        power: "\u{F0425}",
        alert: "\u{F0026}"
    })

    function alpha(color, amount) {
        return Qt.rgba(color.r, color.g, color.b, amount);
    }

    function focusForm() {
        if (username.text.length === 0)
            username.forceActiveFocus();
        else
            password.forceActiveFocus();
    }

    function submit() {
        if (busy || powerDialog.opened)
            return;
        if (username.text.trim().length === 0) {
            failure = qsTr("Enter your username.");
            username.forceActiveFocus();
            return;
        }
        if (session.currentIndex < 0) {
            failure = qsTr("No desktop session is available.");
            return;
        }
        failure = "";
        busy = true;
        // Keep the secret only in the password field and the native auth call.
        sddm.login(username.text.trim(), password.text, session.currentIndex);
        password.clear();
    }

    function chooseSession() {
        var remembered = sessionModel.lastIndex;
        // SDDM also returns 0 when no session has ever been remembered. A
        // remembered user is the only additional history exposed to themes.
        if (remembered >= 0 && remembered < session.count
                && (remembered > 0 || userModel.lastUser.length > 0)) {
            session.currentIndex = remembered;
            return;
        }
        var hyprland = session.find("Hyprland", Qt.MatchStartsWith);
        session.currentIndex = hyprland >= 0 ? hyprland : (session.count > 0 ? 0 : -1);
    }

    function requestPower(action, origin) {
        if (busy || powerDialog.opened)
            return;
        pendingPower = action;
        powerOrigin = origin;
        password.clear();
        powerDialog.open();
    }

    Connections {
        target: sddm
        function onLoginFailed() {
            password.clear();
            root.busy = false;
            root.failure = qsTr("Sign in failed. Check your credentials and try again.");
            password.forceActiveFocus();
        }
        function onLoginSucceeded() {
            password.clear();
            // Stay disabled while the daemon starts the session.
            root.busy = true;
        }
    }

    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: root.now = new Date()
    }

    Image {
        id: wallpaper
        objectName: "wallpaper"
        anchors.fill: parent
        source: config.wallpaper || "wallpaper.jpg"
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        // Software rendering cannot run shader effects; keep the dimmed image.
        visible: !root.effectsAvailable
        onStatusChanged: {
            if (status === Image.Error && source.toString() !== Qt.resolvedUrl("wallpaper.jpg").toString())
                source = "wallpaper.jpg";
        }
    }
    MultiEffect {
        anchors.fill: parent
        source: wallpaper
        visible: root.effectsAvailable && wallpaper.status === Image.Ready
        blurEnabled: true
        blurMax: 16
        blur: 0.35
        autoPaddingEnabled: false
    }
    Rectangle {
        anchors.fill: parent
        color: root.backgroundColor
        opacity: 0.58
    }

    Text {
        id: clock
        objectName: "clock"
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height / 2 - 160 - height / 2
        text: Qt.formatTime(root.now, "HH:mm")
        color: root.foregroundColor
        font.family: root.fontFamily
        font.pixelSize: root.clockSize
        font.weight: Font.Medium
        Accessible.role: Accessible.StaticText
    }
    Text {
        id: dateLabel
        objectName: "date"
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height / 2 - 90 - height / 2
        width: Math.min(700, parent.width - 32)
        horizontalAlignment: Text.AlignHCenter
        text: Qt.formatDate(root.now, "dddd, d MMMM yyyy")
        color: root.foregroundColor
        font.family: root.fontFamily
        font.pixelSize: 18
        wrapMode: Text.WordWrap
    }

    // The ground-coloured input used by the bar popups, enlarged for login.
    // Text is centred so the field matches Hyprlock's native input. Qt hides
    // a centred placeholder on focus, so the hint is drawn here instead and
    // the caret waits for the first character, as in Hyprlock.
    component Field: Controls.TextField {
        id: field
        property string hint: ""
        height: 48
        leftPadding: 16
        rightPadding: 16
        horizontalAlignment: TextInput.AlignHCenter
        color: root.foregroundColor
        placeholderTextColor: root.mutedColor
        selectionColor: root.alpha(root.accentColor, 0.35)
        selectedTextColor: root.foregroundColor
        font.family: root.fontFamily
        font.pixelSize: root.formSize
        passwordCharacter: "•"
        activeFocusOnTab: true
        selectByMouse: true
        opacity: enabled ? 1 : 0.55
        cursorDelegate: Rectangle {
            id: caret
            width: 2
            color: root.foregroundColor
            visible: field.activeFocus && field.length > 0
            SequentialAnimation on opacity {
                running: caret.visible
                loops: Animation.Infinite
                PropertyAction { value: 1 }
                PauseAnimation { duration: 530 }
                PropertyAction { value: 0 }
                PauseAnimation { duration: 530 }
            }
        }
        background: Rectangle {
            color: root.backgroundColor
            radius: root.inputRadius
            border.width: 1
            border.color: field.activeFocus ? root.accentColor : root.ruleColor
            Behavior on border.color { ColorAnimation { duration: 120 } }
            Text {
                anchors.centerIn: parent
                visible: field.length === 0 && field.preeditText.length === 0
                text: field.hint
                color: root.mutedColor
                font: field.font
            }
        }
    }

    // Pill button from the Quickshell kit: normal, primary or danger.
    component Pill: Controls.Button {
        id: pill
        property string kind: "normal"
        height: 48
        leftPadding: 20
        rightPadding: 20
        activeFocusOnTab: true
        hoverEnabled: true
        font.family: root.fontFamily
        font.pixelSize: root.formSize
        font.weight: kind === "primary" ? Font.DemiBold : Font.Normal
        opacity: enabled ? 1 : 0.55
        contentItem: Text {
            text: pill.text
            font: pill.font
            color: pill.kind === "primary" ? root.backgroundColor
                : (pill.kind === "danger" ? root.alertColor : root.foregroundColor)
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            radius: height / 2
            color: pill.kind === "primary"
                ? (pill.down ? Qt.darker(root.accentColor, 1.08)
                    : (pill.hovered ? Qt.lighter(root.accentColor, 1.08) : root.accentColor))
                : pill.kind === "danger"
                    ? root.alpha(root.alertColor, pill.down ? 0.28 : (pill.hovered ? 0.22 : 0.15))
                    : root.alpha(root.foregroundColor, pill.down ? 0.16 : (pill.hovered ? 0.12 : 0.08))
            Behavior on color { ColorAnimation { duration: 120 } }
            // Focus ring sits outside the pill so it also shows on the jade fill.
            Rectangle {
                anchors.fill: parent
                anchors.margins: -4
                radius: height / 2
                color: "transparent"
                border.width: 2
                border.color: root.accentColor
                visible: pill.activeFocus
            }
        }
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()
    }

    // Bar group: the Quickshell bar's ground, outline and radius.
    component Group: Rectangle {
        default property alias content: groupRow.data
        width: groupRow.implicitWidth + 8
        height: 44
        radius: root.groupRadius
        color: root.backgroundColor
        border.width: 1
        border.color: root.ruleColor
        Row {
            id: groupRow
            anchors.centerIn: parent
            spacing: 2
        }
    }

    // Bar button: muted glyph and pearl label, filled on hover.
    component BarAction: Controls.Button {
        id: barAction
        property string glyph: ""
        property color glyphColor: root.mutedColor
        height: 36
        leftPadding: 12
        rightPadding: 14
        activeFocusOnTab: true
        hoverEnabled: true
        font.family: root.fontFamily
        font.pixelSize: root.hintSize
        opacity: enabled ? 1 : 0.55
        contentItem: Row {
            spacing: 10
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: barAction.glyph
                color: barAction.glyphColor
                font.family: root.glyphFamily
                font.pixelSize: 18
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: barAction.text
                color: root.foregroundColor
                font: barAction.font
            }
        }
        background: Rectangle {
            radius: root.controlRadius
            color: root.alpha(root.foregroundColor,
                barAction.down ? 0.12 : (barAction.hovered ? 0.08 : 0))
            border.width: barAction.activeFocus ? 1 : 0
            border.color: root.accentColor
        }
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()
    }

    Rectangle {
        id: card
        objectName: "loginCard"
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height / 2 + 100 - height / 2
        width: Math.min(400, parent.width - 32)
        height: 240
        radius: root.cardRadius
        color: root.surfaceColor
        border.color: root.ruleColor
        border.width: 1

        // Popup lift from DESIGN.md: black at 50%, soft blur, 10px down.
        layer.enabled: root.effectsAvailable
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: "#000000"
            shadowOpacity: 0.5
            shadowBlur: 0.9
            shadowVerticalOffset: 10
            blurMax: 32
        }

        // 36px padding and 12px gaps put the password field on the card's
        // centre line, where Hyprlock draws its only field.
        Column {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.leftMargin: 28
            anchors.rightMargin: 28
            anchors.topMargin: 36
            spacing: 12
            enabled: !root.busy && !powerDialog.opened

            Field {
                id: username
                objectName: "username"
                width: parent.width
                text: userModel.lastUser
                hint: qsTr("Username")
                Accessible.name: qsTr("Username")
                inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
                onTextChanged: {
                    password.clear();
                    root.failure = "";
                }
                onAccepted: root.submit()
                KeyNavigation.tab: password
                KeyNavigation.backtab: powerOff.visible ? powerOff : (reboot.visible ? reboot : (suspend.visible ? suspend : session))
            }
            Field {
                id: password
                objectName: "password"
                width: parent.width
                hint: qsTr("Password")
                Accessible.name: qsTr("Password")
                echoMode: TextInput.Password
                inputMethodHints: Qt.ImhSensitiveData | Qt.ImhHiddenText
                    | Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase
                onAccepted: root.submit()
                KeyNavigation.tab: signIn
                KeyNavigation.backtab: username
            }
            Pill {
                id: signIn
                objectName: "signIn"
                width: parent.width
                kind: "primary"
                text: root.busy ? qsTr("Signing in…") : qsTr("Sign in")
                onClicked: root.submit()
                KeyNavigation.tab: session
                KeyNavigation.backtab: password
            }
        }
    }

    Row {
        id: feedback
        objectName: "feedback"
        readonly property string message: root.failure || (keyboard.capsLock ? qsTr("Caps Lock is on.") : "")
        property alias text: feedbackText.text
        readonly property bool fitsBelow: card.y + card.height + 16 + height + 12 <= root.height - 80
        visible: message.length > 0
        y: fitsBelow ? card.y + card.height + 16 : card.y - height - 14
        anchors.horizontalCenter: card.horizontalCenter
        spacing: 8
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: root.glyphs.alert
            color: feedbackText.color
            font.family: root.glyphFamily
            font.pixelSize: 18
        }
        Text {
            id: feedbackText
            width: Math.min(implicitWidth, root.width - 64)
            anchors.verticalCenter: parent.verticalCenter
            wrapMode: Text.WordWrap
            text: feedback.message
            color: root.failure ? root.alertColor : root.foregroundColor
            font.family: root.fontFamily
            font.pixelSize: root.hintSize
            Accessible.role: Accessible.StaticText
            Accessible.name: text
        }
    }

    // Session choice lives with the other system controls, bottom left.
    Group {
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        anchors.margins: 24
        enabled: !root.busy && !powerDialog.opened && session.count > 0

        Controls.ComboBox {
            id: session
            objectName: "session"
            height: 36
            implicitWidth: sessionContent.implicitWidth + leftPadding + rightPadding
            model: sessionModel
            textRole: "name"
            currentIndex: -1
            activeFocusOnTab: true
            hoverEnabled: true
            font.family: root.fontFamily
            font.pixelSize: root.hintSize
            Accessible.name: qsTr("Desktop session")
            displayText: count > 0 ? currentText : qsTr("No sessions available")
            leftPadding: 12
            rightPadding: 12
            indicator: null
            contentItem: Row {
                id: sessionContent
                spacing: 10
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.glyphs.monitor
                    color: root.mutedColor
                    font.family: root.glyphFamily
                    font.pixelSize: 18
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    width: Math.min(implicitWidth, 320)
                    text: session.displayText
                    color: root.foregroundColor
                    font: session.font
                    elide: Text.ElideRight
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.glyphs.chevronUp
                    color: root.mutedColor
                    font.family: root.glyphFamily
                    font.pixelSize: 16
                    rotation: session.popup.visible ? 180 : 0
                }
            }
            background: Rectangle {
                radius: root.controlRadius
                color: root.alpha(root.foregroundColor,
                    session.popup.visible ? 0.12 : (session.hovered ? 0.08 : 0))
                border.width: session.activeFocus ? 1 : 0
                border.color: root.accentColor
            }
            delegate: Controls.ItemDelegate {
                id: sessionOption
                required property string name
                required property int index
                readonly property bool current: session.currentIndex === index
                width: ListView.view ? ListView.view.width : session.width
                height: 40
                text: name
                highlighted: session.highlightedIndex === index
                font: session.font
                leftPadding: 12
                rightPadding: 12
                contentItem: Text {
                    text: sessionOption.text
                    font: sessionOption.font
                    color: sessionOption.current ? root.accentColor : root.foregroundColor
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                }
                background: Rectangle {
                    radius: root.inputRadius + 1
                    color: sessionOption.highlighted ? root.alpha(root.foregroundColor, 0.08) : "transparent"
                }
            }
            // Opens upward, above the bar group, as a popup card.
            popup: Controls.Popup {
                y: -implicitHeight - 12
                x: -4
                width: Math.max(260, session.width + 8)
                padding: 6
                implicitHeight: Math.min(contentItem.implicitHeight + 12, 260)
                contentItem: ListView {
                    clip: true
                    implicitHeight: contentHeight
                    model: session.popup.visible ? session.delegateModel : null
                    currentIndex: session.highlightedIndex
                    Controls.ScrollIndicator.vertical: Controls.ScrollIndicator {}
                }
                background: Rectangle {
                    color: root.surfaceColor
                    radius: root.cardRadius
                    border.color: root.ruleColor
                }
            }
            KeyNavigation.tab: suspend.visible ? suspend : (reboot.visible ? reboot : (powerOff.visible ? powerOff : username))
            KeyNavigation.backtab: signIn
            Component.onCompleted: root.chooseSession()
        }
    }

    // Power actions use the bar's own button style and glyphs.
    Group {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 24
        visible: sddm.canSuspend || sddm.canReboot || sddm.canPowerOff
        enabled: !root.busy && !powerDialog.opened

        BarAction {
            id: suspend
            objectName: "suspend"
            visible: sddm.canSuspend
            glyph: root.glyphs.sleep
            text: qsTr("Suspend")
            onClicked: {
                if (!root.busy && !powerDialog.opened && sddm.canSuspend) {
                    password.clear();
                    sddm.suspend();
                }
            }
            KeyNavigation.tab: reboot.visible ? reboot : (powerOff.visible ? powerOff : username)
            KeyNavigation.backtab: session
        }
        BarAction {
            id: reboot
            objectName: "reboot"
            visible: sddm.canReboot
            glyph: root.glyphs.restart
            text: qsTr("Restart")
            onClicked: root.requestPower("reboot", reboot)
            KeyNavigation.tab: powerOff.visible ? powerOff : username
            KeyNavigation.backtab: suspend.visible ? suspend : session
        }
        BarAction {
            id: powerOff
            objectName: "powerOff"
            visible: sddm.canPowerOff
            glyph: root.glyphs.power
            glyphColor: root.alertColor
            text: qsTr("Shut down")
            onClicked: root.requestPower("poweroff", powerOff)
            KeyNavigation.tab: username
            KeyNavigation.backtab: reboot.visible ? reboot : (suspend.visible ? suspend : session)
        }
    }

    Controls.Popup {
        id: powerDialog
        objectName: "powerDialog"
        anchors.centerIn: parent
        width: Math.min(400, root.width - 32)
        padding: 24
        modal: true
        focus: true
        closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
        background: Rectangle {
            color: root.surfaceColor
            radius: root.cardRadius
            border.color: root.ruleColor
        }
        Controls.Overlay.modal: Rectangle {
            color: root.backgroundColor
            opacity: 0.8
        }
        onOpened: cancelPower.forceActiveFocus()
        onClosed: {
            root.pendingPower = "";
            if (root.powerOrigin)
                root.powerOrigin.forceActiveFocus();
        }
        contentItem: Column {
            spacing: 24
            Row {
                width: parent.width
                spacing: 14
                Rectangle {
                    width: 44
                    height: 44
                    radius: 22
                    color: root.alpha(root.alertColor, 0.15)
                    Text {
                        anchors.centerIn: parent
                        text: root.pendingPower === "reboot" ? root.glyphs.restart : root.glyphs.power
                        color: root.alertColor
                        font.family: root.glyphFamily
                        font.pixelSize: 22
                    }
                }
                Column {
                    width: parent.width - 58
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 4
                    Text {
                        width: parent.width
                        text: root.pendingPower === "reboot" ? qsTr("Restart this computer?") : qsTr("Shut down this computer?")
                        color: root.foregroundColor
                        font.family: root.fontFamily
                        font.pixelSize: 18
                        font.weight: Font.DemiBold
                        wrapMode: Text.WordWrap
                    }
                    Text {
                        width: parent.width
                        text: qsTr("Running sessions will end.")
                        color: root.mutedColor
                        font.family: root.fontFamily
                        font.pixelSize: root.hintSize
                        wrapMode: Text.WordWrap
                    }
                }
            }
            Row {
                width: parent.width
                spacing: 12
                Pill {
                    id: cancelPower
                    objectName: "cancelPower"
                    width: (parent.width - parent.spacing) / 2
                    height: 44
                    text: qsTr("Cancel")
                    font.pixelSize: root.hintSize
                    onClicked: powerDialog.close()
                    KeyNavigation.tab: confirmPower
                    KeyNavigation.backtab: confirmPower
                }
                Pill {
                    id: confirmPower
                    objectName: "confirmPower"
                    width: (parent.width - parent.spacing) / 2
                    height: 44
                    kind: "danger"
                    text: root.pendingPower === "reboot" ? qsTr("Restart") : qsTr("Shut down")
                    font.pixelSize: root.hintSize
                    onClicked: {
                        var action = root.pendingPower;
                        powerDialog.close();
                        if (action === "reboot" && sddm.canReboot)
                            sddm.reboot();
                        else if (action === "poweroff" && sddm.canPowerOff)
                            sddm.powerOff();
                    }
                    KeyNavigation.tab: cancelPower
                    KeyNavigation.backtab: cancelPower
                }
            }
        }
    }

    Component.onCompleted: focusForm()
}
