pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls.Basic as Controls
import QtQuick.Effects

// Leo login. Same composition as Hyprlock: the time, the account and one
// field over the darkened wallpaper, with session and power controls in the
// bottom corners. See DESIGN.md, Authentication.
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
    readonly property color warningColor: config.warning || "#E0AF68"

    // Large type uses the display face; the small corner controls keep the
    // desktop bar's monospace and its proportional Nerd Font glyphs.
    readonly property string monoFamily: config.fontFamily || "JetBrainsMono Nerd Font"
    readonly property string glyphFamily: monoFamily + " Propo"
    readonly property string displayFamily: config.displayFamily || "Mona Sans Display SemiExpanded"
    readonly property string textFamily: config.textFamily || "Mona Sans SemiExpanded"
    readonly property int clockSize: Number(config.clockSize) || 120
    readonly property int textSize: Number(config.textSize) || 20
    readonly property int fieldSize: Number(config.fieldSize) || 18
    readonly property int chipSize: Number(config.chipSize) || 14
    readonly property int glyphSize: chipSize + 3
    readonly property int messageSize: chipSize + 1
    readonly property int cardRadius: Number(config.cardRadius) || 14
    readonly property int inputRadius: Number(config.inputRadius) || 8
    // Quickshell popup cards outline themselves with pearl at 7%.
    readonly property color cardEdgeColor: alpha(foregroundColor, 0.07)
    readonly property bool effectsAvailable: GraphicsInfo.api !== GraphicsInfo.Software

    // Shared grid with hyprlock.conf: box centres relative to screen centre.
    readonly property real centreY: height / 2
    readonly property int clockOffset: -150
    readonly property int dateOffset: -60
    readonly property int nameOffset: 56
    readonly property int fieldOffset: 110
    readonly property int messageOffset: 164
    readonly property int edge: 24
    readonly property int controlSize: 36

    property date now: new Date()
    property bool busy: false
    property string failure: ""
    property string notice: ""
    property string pendingPower: ""
    property Item powerOrigin: null

    // Material Design glyphs from the Nerd Font; the same set as the bar.
    readonly property var glyphs: ({
        monitor: "\u{F0379}",
        check: "\u{F012C}",
        sleep: "\u{F04B2}",
        restart: "\u{F0709}",
        power: "\u{F0425}",
        alert: "\u{F0026}",
        capsLock: "\u{F0632}",
        arrow: "\u{F0054}"
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
            notice = qsTr("Enter a username");
            username.forceActiveFocus();
            return;
        }
        if (session.currentIndex < 0) {
            notice = qsTr("No desktop session available");
            return;
        }
        failure = "";
        notice = "";
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
        failure = "";
        password.clear();
        powerDialog.open();
    }

    Connections {
        target: sddm
        function onLoginFailed() {
            password.clear();
            root.busy = false;
            root.failure = qsTr("Wrong password");
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
        y: root.centreY + root.clockOffset - height / 2
        text: Qt.formatTime(root.now, "HH:mm")
        color: root.foregroundColor
        font.family: root.displayFamily
        font.pixelSize: root.clockSize
        font.weight: Font.Light
        Accessible.role: Accessible.StaticText
    }

    Text {
        id: date
        objectName: "date"
        anchors.horizontalCenter: parent.horizontalCenter
        y: root.centreY + root.dateOffset - height / 2
        text: Qt.formatDate(root.now, "dddd d MMMM")
        color: root.mutedColor
        font.family: root.textFamily
        font.pixelSize: root.textSize
        Accessible.role: Accessible.StaticText
    }

    // Text caret shared by both fields: pearl, blinking, hidden until typing
    // starts, as in Hyprlock.
    component Caret: Rectangle {
        id: caret
        required property Controls.TextField field
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

    // A round control from the desktop kit: text at 8%, 12% on hover, 16%
    // pressed or open; a jade ring outside it for keyboard focus.
    component ControlBackground: Rectangle {
        required property Item control
        property bool open: false
        radius: height / 2
        color: root.alpha(root.foregroundColor,
            control.down || open ? 0.16 : (control.hovered ? 0.12 : 0.08))
        Behavior on color { ColorAnimation { duration: 120 } }
        Rectangle {
            anchors.fill: parent
            anchors.margins: -3
            radius: height / 2
            color: "transparent"
            border.width: 2
            border.color: root.accentColor
            visible: parent.control.visualFocus
        }
    }

    // Small tip above a corner control, as Quickshell tooltips sit beside
    // their button.
    component Tip: Controls.ToolTip {
        id: tip
        required property Item control
        visible: text.length > 0 && (control.hovered || control.visualFocus)
        delay: control.visualFocus ? 0 : 400
        y: -height - 10
        x: (control.width - width) / 2
        padding: 0
        leftPadding: 10
        rightPadding: 10
        topPadding: 5
        bottomPadding: 5
        contentItem: Text {
            text: tip.text
            color: root.foregroundColor
            font.family: root.monoFamily
            font.pixelSize: root.chipSize - 1
        }
        background: Rectangle {
            color: root.surfaceColor
            radius: Math.round(root.inputRadius * 0.7)
            border.width: 1
            border.color: root.cardEdgeColor
        }
    }

    component IconButton: Controls.Button {
        id: iconButton
        property string glyph: ""
        property color tone: root.foregroundColor
        property bool open: false
        property string tip: ""
        width: root.controlSize
        height: root.controlSize
        padding: 0
        activeFocusOnTab: true
        hoverEnabled: true
        opacity: enabled ? 1 : 0.55
        Accessible.name: tip
        contentItem: Text {
            text: iconButton.glyph
            color: iconButton.tone
            font.family: root.glyphFamily
            font.pixelSize: root.glyphSize
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
        background: ControlBackground { control: iconButton; open: iconButton.open }
        Tip { control: iconButton; text: iconButton.open ? "" : iconButton.tip }
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()
    }

    // Pill button from the Quickshell kit, for the confirmation card. The
    // card is desktop chrome, so it keeps the desktop's monospace.
    component Pill: Controls.Button {
        id: pill
        property bool danger: false
        height: 40
        leftPadding: 18
        rightPadding: 18
        activeFocusOnTab: true
        hoverEnabled: true
        font.family: root.monoFamily
        font.pixelSize: root.messageSize + 1
        contentItem: Text {
            text: pill.text
            font: pill.font
            color: pill.danger ? root.alertColor : root.foregroundColor
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
        background: Rectangle {
            radius: height / 2
            color: pill.danger
                ? root.alpha(root.alertColor, pill.down ? 0.28 : (pill.hovered ? 0.22 : 0.15))
                : root.alpha(root.foregroundColor, pill.down ? 0.16 : (pill.hovered ? 0.12 : 0.08))
            Behavior on color { ColorAnimation { duration: 120 } }
            Rectangle {
                anchors.fill: parent
                anchors.margins: -3
                radius: height / 2
                color: "transparent"
                border.width: 2
                border.color: root.accentColor
                visible: pill.visualFocus
            }
        }
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()
    }

    // A popup card from the Quickshell kit: surface, pearl hairline, one lift.
    component CardBackground: Rectangle {
        color: root.surfaceColor
        radius: root.cardRadius
        border.width: 1
        border.color: root.cardEdgeColor
        layer.enabled: root.effectsAvailable
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: "#000000"
            shadowOpacity: 0.5
            shadowBlur: 0.9
            shadowVerticalOffset: 10
            blurMax: 32
        }
    }

    // Quickshell's popup reveal, mirrored for controls at the bottom edge:
    // fade in while rising 6px into place.
    component Reveal: Transition {
        id: reveal
        property real toY: 0
        NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 140; easing.type: Easing.OutCubic }
        NumberAnimation { property: "y"; from: reveal.toY + 6; to: reveal.toY; duration: 180; easing.type: Easing.OutCubic }
    }

    Item {
        id: form
        anchors.fill: parent
        enabled: !root.busy && !powerDialog.opened

        // The account reads as a name, not a form field, until it is pointed
        // at or focused; then it shows the field shape so editing is obvious.
        Controls.TextField {
            id: username
            objectName: "username"
            readonly property bool framed: activeFocus || text.length === 0
            anchors.horizontalCenter: parent.horizontalCenter
            y: root.centreY + root.nameOffset - height / 2
            width: Math.min(320, root.width - 48)
            height: 40
            leftPadding: 20
            rightPadding: 20
            topPadding: 0
            bottomPadding: 0
            text: userModel.lastUser
            horizontalAlignment: TextInput.AlignHCenter
            verticalAlignment: TextInput.AlignVCenter
            color: root.foregroundColor
            selectionColor: root.alpha(root.accentColor, 0.35)
            selectedTextColor: root.foregroundColor
            font.family: root.textFamily
            font.pixelSize: root.textSize
            font.weight: Font.Medium
            hoverEnabled: true
            selectByMouse: true
            activeFocusOnTab: true
            opacity: enabled ? 1 : 0.55
            Accessible.name: qsTr("Username")
            inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
            cursorDelegate: Caret { field: username }
            background: Rectangle {
                radius: height / 2
                color: username.framed ? root.backgroundColor
                    : root.alpha(root.foregroundColor, username.hovered ? 0.08 : 0)
                border.width: username.framed ? 1 : 0
                border.color: username.activeFocus ? root.accentColor : root.ruleColor
                Behavior on color { ColorAnimation { duration: 120 } }
                Text {
                    anchors.centerIn: parent
                    visible: username.length === 0 && username.preeditText.length === 0
                    text: qsTr("Username")
                    color: root.mutedColor
                    font.family: root.textFamily
                    font.pixelSize: root.fieldSize
                }
            }
            onTextChanged: {
                password.clear();
                root.failure = "";
                root.notice = "";
            }
            onAccepted: password.forceActiveFocus()
            KeyNavigation.tab: password
            KeyNavigation.backtab: powerOff.visible ? powerOff : (reboot.visible ? reboot : (suspend.visible ? suspend : session))
        }

        // Ground pill with the rule outline; jade while focused, rose after a
        // failed sign-in, amber with Caps Lock. Failure and progress read in
        // the field itself, where Hyprlock shows them.
        Controls.TextField {
            id: password
            objectName: "password"
            readonly property color ring: root.failure.length > 0 && length === 0 ? root.alertColor
                : keyboard.capsLock ? root.warningColor
                : activeFocus ? root.accentColor : root.ruleColor
            readonly property string hint: root.busy ? qsTr("Signing in…")
                : root.failure.length > 0 ? root.failure : qsTr("Password")
            anchors.horizontalCenter: parent.horizontalCenter
            y: root.centreY + root.fieldOffset - height / 2
            width: Math.min(320, root.width - 48)
            height: 48
            // Equal padding keeps typed dots centred, as in Hyprlock; the
            // right side also holds the sign-in arrow.
            leftPadding: 50
            rightPadding: 50
            topPadding: 0
            bottomPadding: 0
            horizontalAlignment: TextInput.AlignHCenter
            verticalAlignment: TextInput.AlignVCenter
            echoMode: TextInput.Password
            // Roughly Hyprlock's dots: about 8px across with a small gap. The
            // size applies only to typed dots; the hint sets its own font.
            passwordCharacter: "\u2022"
            font.letterSpacing: 2
            color: root.foregroundColor
            selectionColor: root.alpha(root.accentColor, 0.35)
            selectedTextColor: root.foregroundColor
            font.family: root.textFamily
            font.pixelSize: root.fieldSize + 10
            activeFocusOnTab: true
            selectByMouse: true
            opacity: enabled || root.busy ? 1 : 0.55
            Accessible.name: qsTr("Password")
            inputMethodHints: Qt.ImhSensitiveData | Qt.ImhHiddenText
                | Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase
            cursorDelegate: Caret { field: password }
            background: Rectangle {
                radius: height / 2
                color: root.backgroundColor
                border.width: 1
                border.color: password.ring
                Behavior on border.color { ColorAnimation { duration: 120 } }
                // Qt hides a centred placeholder on focus; draw it here.
                Text {
                    objectName: "passwordHint"
                    anchors.centerIn: parent
                    visible: password.length === 0 && password.preeditText.length === 0
                    text: password.hint
                    color: root.failure.length > 0 && !root.busy ? root.alertColor : root.mutedColor
                    font.family: root.textFamily
                    font.pixelSize: root.fieldSize
                }
            }
            onTextChanged: if (length > 0) root.failure = ""
            onAccepted: root.submit()
            KeyNavigation.tab: signIn.visible ? signIn : session
            KeyNavigation.backtab: username

            // The real Sign in button, inside the field's right end once
            // there is something to submit.
            Controls.Button {
                id: signIn
                objectName: "signIn"
                anchors.right: parent.right
                anchors.rightMargin: 6
                anchors.verticalCenter: parent.verticalCenter
                width: 36
                height: 36
                padding: 0
                visible: password.length > 0
                activeFocusOnTab: true
                hoverEnabled: true
                Accessible.name: qsTr("Sign in")
                contentItem: Text {
                    text: root.glyphs.arrow
                    color: root.backgroundColor
                    font.family: root.glyphFamily
                    font.pixelSize: root.glyphSize + 1
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle {
                    radius: height / 2
                    color: signIn.down ? Qt.darker(root.accentColor, 1.08)
                        : (signIn.hovered ? Qt.lighter(root.accentColor, 1.08) : root.accentColor)
                    Behavior on color { ColorAnimation { duration: 120 } }
                    Rectangle {
                        anchors.fill: parent
                        anchors.margins: -3
                        radius: height / 2
                        color: "transparent"
                        border.width: 2
                        border.color: root.accentColor
                        visible: signIn.visualFocus
                    }
                }
                onClicked: root.submit()
                Keys.onReturnPressed: clicked()
                Keys.onEnterPressed: clicked()
                KeyNavigation.tab: session
                KeyNavigation.backtab: password
            }
        }
    }

    // One short line under the field for what the field cannot say itself.
    Row {
        id: feedback
        objectName: "feedback"
        readonly property bool caps: keyboard.capsLock && root.notice.length === 0
        readonly property string message: root.notice || (keyboard.capsLock ? qsTr("Caps Lock") : "")
        property alias text: feedbackText.text
        visible: message.length > 0
        anchors.horizontalCenter: parent.horizontalCenter
        y: root.centreY + root.messageOffset - height / 2
        spacing: 8
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: feedback.caps ? root.glyphs.capsLock : root.glyphs.alert
            color: feedbackText.color
            font.family: root.glyphFamily
            font.pixelSize: root.messageSize + 2
        }
        Text {
            id: feedbackText
            width: Math.min(implicitWidth, root.width - 64)
            anchors.verticalCenter: parent.verticalCenter
            wrapMode: Text.WordWrap
            text: feedback.message
            color: feedback.caps ? root.warningColor : root.alertColor
            font.family: root.textFamily
            font.pixelSize: root.messageSize
            Accessible.role: Accessible.StaticText
            Accessible.name: text
        }
    }

    // Bottom left: the session as a pill chip. Its list rises above it.
    Controls.ComboBox {
        id: session
        objectName: "session"
        x: root.edge
        y: root.height - root.edge - height
        enabled: count > 0 && !root.busy && !powerDialog.opened
        height: root.controlSize
        implicitWidth: sessionContent.implicitWidth + leftPadding + rightPadding
        model: sessionModel
        textRole: "name"
        currentIndex: -1
        activeFocusOnTab: true
        hoverEnabled: true
        font.family: root.monoFamily
        font.pixelSize: root.chipSize
        Accessible.name: qsTr("Desktop session")
        displayText: count > 0 ? currentText : qsTr("No sessions")
        leftPadding: 14
        rightPadding: 16
        topPadding: 0
        bottomPadding: 0
        indicator: null
        opacity: enabled ? 1 : 0.55
        contentItem: Row {
            id: sessionContent
            spacing: 8
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: root.glyphs.monitor
                color: root.foregroundColor
                font.family: root.glyphFamily
                font.pixelSize: root.glyphSize
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(implicitWidth, 240)
                text: session.displayText
                color: root.foregroundColor
                font: session.font
                elide: Text.ElideRight
            }
        }
        background: ControlBackground { control: session; open: session.popup.visible }
        delegate: Controls.ItemDelegate {
            id: sessionOption
            required property string name
            required property int index
            readonly property bool current: session.currentIndex === index
            width: ListView.view ? ListView.view.width : session.width
            height: 40
            text: name
            highlighted: session.highlightedIndex === index
            font.family: root.monoFamily
            font.pixelSize: root.chipSize
            leftPadding: 12
            rightPadding: 12
            contentItem: Item {
                Text {
                    anchors.left: parent.left
                    anchors.right: tick.left
                    anchors.rightMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    text: sessionOption.text
                    font: sessionOption.font
                    color: sessionOption.current ? root.accentColor : root.foregroundColor
                    elide: Text.ElideRight
                }
                Text {
                    id: tick
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    visible: sessionOption.current
                    text: root.glyphs.check
                    color: root.accentColor
                    font.family: root.glyphFamily
                    font.pixelSize: root.glyphSize
                }
            }
            background: Rectangle {
                radius: root.inputRadius + 1
                color: sessionOption.highlighted ? root.alpha(root.foregroundColor, 0.08) : "transparent"
            }
        }
        popup: Controls.Popup {
            id: sessionPopup
            parent: root
            readonly property real riseY: session.y - 8 - height
            x: session.x
            y: riseY
            width: Math.max(240, session.width)
            padding: 6
            implicitHeight: Math.min(contentItem.implicitHeight + 12, 320)
            enter: Reveal { toY: sessionPopup.riseY }
            contentItem: ListView {
                clip: true
                implicitHeight: contentHeight
                model: session.popup.visible ? session.delegateModel : null
                currentIndex: session.highlightedIndex
                Controls.ScrollIndicator.vertical: Controls.ScrollIndicator {}
            }
            background: CardBackground {}
        }
        KeyNavigation.tab: suspend.visible ? suspend : (reboot.visible ? reboot : (powerOff.visible ? powerOff : username))
        KeyNavigation.backtab: signIn.visible ? signIn : password
        Component.onCompleted: root.chooseSession()
    }

    // Bottom right: icon-only power actions; shut down in rose.
    Row {
        id: powerRow
        objectName: "powerRow"
        x: root.width - root.edge - width
        y: root.height - root.edge - height
        spacing: 8
        enabled: !root.busy && !powerDialog.opened

        IconButton {
            id: suspend
            objectName: "suspend"
            visible: sddm.canSuspend
            glyph: root.glyphs.sleep
            tip: qsTr("Suspend")
            onClicked: {
                if (!root.busy && !powerDialog.opened && sddm.canSuspend) {
                    password.clear();
                    sddm.suspend();
                }
            }
            KeyNavigation.tab: reboot.visible ? reboot : (powerOff.visible ? powerOff : username)
            KeyNavigation.backtab: session
        }
        IconButton {
            id: reboot
            objectName: "reboot"
            visible: sddm.canReboot
            glyph: root.glyphs.restart
            tip: qsTr("Restart")
            open: root.pendingPower === "reboot"
            onClicked: root.requestPower("reboot", reboot)
            KeyNavigation.tab: powerOff.visible ? powerOff : username
            KeyNavigation.backtab: suspend.visible ? suspend : session
        }
        IconButton {
            id: powerOff
            objectName: "powerOff"
            visible: sddm.canPowerOff
            glyph: root.glyphs.power
            tone: root.alertColor
            tip: qsTr("Shut down")
            open: root.pendingPower === "poweroff"
            onClicked: root.requestPower("poweroff", powerOff)
            KeyNavigation.tab: username
            KeyNavigation.backtab: reboot.visible ? reboot : (suspend.visible ? suspend : session)
        }
    }

    // Confirmation rises from the power buttons like a Quickshell popup. It
    // stays modal so Cancel holds focus, but leaves the screen undimmed.
    Controls.Popup {
        id: powerDialog
        objectName: "powerDialog"
        readonly property real riseY: powerRow.y - 8 - height
        x: root.width - root.edge - width
        y: riseY
        width: Math.min(300, root.width - 2 * root.edge)
        padding: 16
        modal: true
        focus: true
        closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
        enter: Reveal { toY: powerDialog.riseY }
        background: CardBackground {}
        Controls.Overlay.modal: Item {}
        onOpened: cancelPower.forceActiveFocus()
        onClosed: {
            root.pendingPower = "";
            if (root.powerOrigin)
                root.powerOrigin.forceActiveFocus();
        }
        contentItem: Column {
            spacing: 18
            Row {
                spacing: 12
                Rectangle {
                    width: 36
                    height: 36
                    radius: 18
                    color: root.alpha(root.alertColor, 0.15)
                    Text {
                        anchors.centerIn: parent
                        text: root.pendingPower === "reboot" ? root.glyphs.restart : root.glyphs.power
                        color: root.alertColor
                        font.family: root.glyphFamily
                        font.pixelSize: root.glyphSize + 2
                    }
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.pendingPower === "reboot" ? qsTr("Restart now?") : qsTr("Shut down now?")
                    color: root.foregroundColor
                    font.family: root.monoFamily
                    font.pixelSize: root.messageSize + 2
                    font.weight: Font.DemiBold
                }
            }
            Row {
                x: parent.width - width
                spacing: 10
                Pill {
                    id: cancelPower
                    objectName: "cancelPower"
                    text: qsTr("Cancel")
                    onClicked: powerDialog.close()
                    KeyNavigation.tab: confirmPower
                    KeyNavigation.backtab: confirmPower
                }
                Pill {
                    id: confirmPower
                    objectName: "confirmPower"
                    danger: true
                    text: root.pendingPower === "reboot" ? qsTr("Restart") : qsTr("Shut down")
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
