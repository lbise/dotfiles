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
    // Desktop palette body text is smaller; login fields stay readable at a distance.
    readonly property int formSize: Math.max(16, Number(config.fontSize) || 18)
    readonly property int cardRadius: Number(config.cardRadius) || 14
    readonly property int inputRadius: Number(config.inputRadius) || 8
    readonly property int clockSize: Number(config.clockSize) || 72
    readonly property bool effectsAvailable: GraphicsInfo.api !== GraphicsInfo.Software
    property date now: new Date()
    property bool busy: false
    property string failure: ""
    property string pendingPower: ""
    property Item powerOrigin: null

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

    component Field: Controls.TextField {
        id: field
        height: 48
        leftPadding: 14
        rightPadding: 14
        color: root.foregroundColor
        placeholderTextColor: root.mutedColor
        selectionColor: root.accentColor
        selectedTextColor: root.backgroundColor
        font.family: root.fontFamily
        font.pixelSize: root.formSize
        activeFocusOnTab: true
        selectByMouse: true
        background: Rectangle {
            color: root.backgroundColor
            radius: root.inputRadius
            border.color: root.ruleColor
            border.width: field.activeFocus ? 2 : 1
        }
    }

    component Action: Controls.Button {
        id: action
        property bool primary: false
        property bool destructive: false
        height: 48
        leftPadding: 16
        rightPadding: 16
        activeFocusOnTab: true
        hoverEnabled: true
        font.family: root.fontFamily
        font.pixelSize: root.formSize
        opacity: enabled ? 1 : 0.55
        contentItem: Text {
            text: action.text
            font: action.font
            color: action.primary ? root.backgroundColor
                : (action.destructive ? root.alertColor : root.foregroundColor)
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            color: action.primary ? root.accentColor : root.surfaceColor
            radius: root.inputRadius
            border.color: root.ruleColor
            border.width: action.activeFocus ? 2 : 1
            Rectangle {
                anchors.fill: parent
                radius: parent.radius
                color: root.foregroundColor
                opacity: action.down ? 0.16 : (action.hovered ? 0.08 : 0)
            }
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

        Column {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.leftMargin: 28
            anchors.rightMargin: 28
            anchors.topMargin: 20
            spacing: 12
            enabled: !root.busy && !powerDialog.opened

            Field {
                id: username
                objectName: "username"
                width: parent.width
                text: userModel.lastUser
                placeholderText: qsTr("Username")
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
                placeholderText: qsTr("Password")
                Accessible.name: qsTr("Password")
                echoMode: TextInput.Password
                inputMethodHints: Qt.ImhSensitiveData | Qt.ImhHiddenText
                    | Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase
                onAccepted: root.submit()
                KeyNavigation.tab: signIn
                KeyNavigation.backtab: username
            }
            Action {
                id: signIn
                objectName: "signIn"
                width: parent.width
                primary: true
                text: root.busy ? qsTr("Signing in…") : qsTr("Sign in")
                onClicked: root.submit()
                KeyNavigation.tab: session
                KeyNavigation.backtab: password
            }
        }

        Controls.ComboBox {
            id: session
            objectName: "session"
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.leftMargin: 28
            anchors.rightMargin: 28
            anchors.bottomMargin: 20
            height: 24
            enabled: !root.busy && !powerDialog.opened && count > 0
            model: sessionModel
            textRole: "name"
            currentIndex: -1
            activeFocusOnTab: true
            hoverEnabled: true
            font.family: root.fontFamily
            font.pixelSize: 16
            Accessible.name: qsTr("Desktop session")
            displayText: count > 0 ? qsTr("Session: %1").arg(currentText) : qsTr("No sessions available")
            leftPadding: 4
            rightPadding: 20
            indicator: Canvas {
                x: parent.width - width - 4
                y: (parent.height - height) / 2
                width: 10
                height: 6
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = root.mutedColor;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(1, 1);
                    ctx.lineTo(5, 5);
                    ctx.lineTo(9, 1);
                    ctx.stroke();
                }
            }
            contentItem: Text {
                text: session.displayText
                font: session.font
                color: root.mutedColor
                elide: Text.ElideRight
                verticalAlignment: Text.AlignVCenter
            }
            background: Rectangle {
                color: session.hovered ? root.backgroundColor : "transparent"
                radius: 4
                border.color: root.ruleColor
                border.width: session.activeFocus ? 2 : 0
            }
            delegate: Controls.ItemDelegate {
                id: sessionOption
                required property string name
                required property int index
                width: session.width
                height: 40
                text: name
                highlighted: session.highlightedIndex === index
                font: session.font
                contentItem: Text {
                    text: sessionOption.text
                    font: sessionOption.font
                    color: sessionOption.highlighted ? root.accentColor : root.foregroundColor
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                }
                background: Rectangle {
                    color: sessionOption.highlighted ? root.backgroundColor : root.surfaceColor
                }
            }
            popup: Controls.Popup {
                y: session.height + 8
                width: session.width
                padding: 6
                implicitHeight: Math.min(contentItem.implicitHeight + 12, 200)
                contentItem: ListView {
                    clip: true
                    implicitHeight: contentHeight
                    model: session.popup.visible ? session.delegateModel : null
                    currentIndex: session.highlightedIndex
                    Controls.ScrollIndicator.vertical: Controls.ScrollIndicator {}
                }
                background: Rectangle {
                    color: root.surfaceColor
                    radius: root.inputRadius
                    border.color: root.ruleColor
                }
            }
            KeyNavigation.tab: suspend.visible ? suspend : (reboot.visible ? reboot : (powerOff.visible ? powerOff : username))
            KeyNavigation.backtab: signIn
            Component.onCompleted: root.chooseSession()
        }
    }

    Text {
        id: feedback
        objectName: "feedback"
        readonly property bool fitsBelow: card.y + card.height + 14 + implicitHeight + 12 <= root.height - 72
        y: fitsBelow ? card.y + card.height + 14 : card.y - implicitHeight - 14
        anchors.horizontalCenter: card.horizontalCenter
        width: Math.min(520, parent.width - 32)
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        text: root.failure || (keyboard.capsLock ? qsTr("Caps Lock is on.") : "")
        color: root.failure ? root.alertColor : root.mutedColor
        font.family: root.fontFamily
        font.pixelSize: 16
        Accessible.role: Accessible.StaticText
        Accessible.name: text
    }

    Row {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 24
        spacing: 12
        enabled: !root.busy && !powerDialog.opened
        Action {
            id: suspend
            objectName: "suspend"
            visible: sddm.canSuspend
            text: qsTr("Suspend")
            font.pixelSize: 16
            onClicked: {
                if (!root.busy && !powerDialog.opened && sddm.canSuspend) {
                    password.clear();
                    sddm.suspend();
                }
            }
            KeyNavigation.tab: reboot.visible ? reboot : (powerOff.visible ? powerOff : username)
            KeyNavigation.backtab: session
        }
        Action {
            id: reboot
            objectName: "reboot"
            visible: sddm.canReboot
            text: qsTr("Restart")
            font.pixelSize: 16
            onClicked: root.requestPower("reboot", reboot)
            KeyNavigation.tab: powerOff.visible ? powerOff : username
            KeyNavigation.backtab: suspend.visible ? suspend : session
        }
        Action {
            id: powerOff
            objectName: "powerOff"
            visible: sddm.canPowerOff
            text: qsTr("Power off")
            font.pixelSize: 16
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
        height: 200
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
        contentItem: Item {
            Text {
                width: parent.width
                text: root.pendingPower === "reboot" ? qsTr("Restart this computer?") : qsTr("Power off this computer?")
                color: root.foregroundColor
                font.family: root.fontFamily
                font.pixelSize: 18
                wrapMode: Text.WordWrap
            }
            Text {
                y: 40
                width: parent.width
                text: qsTr("This will end any running sessions.")
                color: root.mutedColor
                font.family: root.fontFamily
                font.pixelSize: 16
                wrapMode: Text.WordWrap
            }
            Row {
                anchors.bottom: parent.bottom
                width: parent.width
                spacing: 12
                Action {
                    id: cancelPower
                    objectName: "cancelPower"
                    width: (parent.width - parent.spacing) / 2
                    text: qsTr("Cancel")
                    font.pixelSize: 16
                    onClicked: powerDialog.close()
                    KeyNavigation.tab: confirmPower
                    KeyNavigation.backtab: confirmPower
                }
                Action {
                    id: confirmPower
                    objectName: "confirmPower"
                    width: (parent.width - parent.spacing) / 2
                    destructive: true
                    text: root.pendingPower === "reboot" ? qsTr("Restart") : qsTr("Power off")
                    font.pixelSize: 16
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
