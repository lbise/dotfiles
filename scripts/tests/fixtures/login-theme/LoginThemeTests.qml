import QtQuick
import QtTest

Item {
    id: fixture
    width: 1280
    height: 720
    required property url themeUrl
    required property url wallpaperUrl
    property string captureDirectory: ""
    property var config: ({ fontFamily: "JetBrainsMono Nerd Font", wallpaper: wallpaperUrl })

    // These IDs supply the same context names as the greeter, without any
    // daemon connection. Secrets are neither retained nor printed by the mock.
    QtObject { id: keyboard; property bool capsLock: false }
    QtObject { id: userModel; property string lastUser: "preview-user" }
    ListModel {
        id: sessionModel
        property int lastIndex: 0
        ListElement { name: "Other desktop" }
        ListElement { name: "Hyprland" }
        ListElement { name: "Hyprland (uwsm)" }
    }
    QtObject {
        id: sddm
        property bool canSuspend: true
        property bool canReboot: true
        property bool canPowerOff: true
        property int loginCalls: 0
        property int suspendCalls: 0
        property int rebootCalls: 0
        property int powerOffCalls: 0
        property string submittedUser: ""
        property int submittedSession: -1
        property bool submittedExpectedSecret: false
        signal loginFailed()
        signal loginSucceeded()
        function login(user, secret, session) {
            loginCalls++;
            submittedUser = user;
            submittedSession = session;
            // Record only whether the synthetic input reached the native call.
            submittedExpectedSecret = secret === "synthetic-test-value";
        }
        function suspend() { suspendCalls++; }
        function reboot() { rebootCalls++; }
        function powerOff() { powerOffCalls++; }
    }
    Loader {
        id: loader
        anchors.fill: parent
        source: fixture.themeUrl
    }
    TestCase {
        name: "LeoLogin"
        when: windowShown && loader.status === Loader.Ready
        property var theme: loader.item
        property var username: findChild(theme, "username")
        property var password: findChild(theme, "password")
        property var session: findChild(theme, "session")

        function init() {
            findChild(theme, "powerDialog").close();
            fixture.width = 1280;
            fixture.height = 720;
            theme.busy = false;
            theme.failure = "";
            theme.notice = "";
            sddm.canSuspend = true;
            sddm.canReboot = true;
            sddm.canPowerOff = true;
            username.text = "preview-user";
            password.text = "";
            sessionModel.lastIndex = 0;
            userModel.lastUser = "preview-user";
            keyboard.capsLock = false;
            sddm.loginCalls = 0;
            sddm.submittedExpectedSecret = false;
            sddm.suspendCalls = 0;
            sddm.rebootCalls = 0;
            sddm.powerOffCalls = 0;
            theme.chooseSession();
            theme.focusForm();
            wait(10);
        }
        function test_geometry() {
            var centre = theme.height / 2;
            function middle(item) { return item.mapToItem(theme, 0, 0).y + item.height / 2; }
            // The shared grid with hyprlock.conf: box centres from screen centre.
            var clock = findChild(theme, "clock");
            compare(middle(clock), centre - 150);
            compare(clock.font.pixelSize, 120);
            compare(clock.font.family, "Mona Sans Display SemiExpanded");
            var date = findChild(theme, "date");
            compare(middle(date), centre - 60);
            verify(date.text.length > 0);
            compare(middle(username), centre + 56);
            compare(middle(password), centre + 110);
            compare(password.width, 320);
            compare(password.height, 48);
            compare(username.width, 320);
            fuzzyCompare(password.mapToItem(theme, password.width / 2, 0).x, theme.width / 2, 1);
            // No bar and no card: nothing else sits above the clock.
            compare(findChild(theme, "bar"), null);
            compare(findChild(theme, "loginCard"), null);
            // Corner controls: 36px tall, 24px in from the bottom edges.
            var sessionPos = session.mapToItem(theme, 0, 0);
            compare(sessionPos.x, 24);
            compare(sessionPos.y + session.height, theme.height - 24);
            compare(session.height, 36);
            var powerOff = findChild(theme, "powerOff");
            var powerPos = powerOff.mapToItem(theme, 0, 0);
            compare(powerPos.x + powerOff.width, theme.width - 24);
            compare(powerPos.y + powerOff.height, theme.height - 24);
            compare(powerOff.width, 36);
        }
        function test_initialFocusAndTab() {
            verify(password.activeFocus);
            // The sign-in arrow appears only once there is a password.
            verify(!findChild(theme, "signIn").visible);
            keyClick(Qt.Key_Tab);
            verify(session.activeFocus);
            keyClick(Qt.Key_Backtab, Qt.ShiftModifier);
            verify(password.activeFocus);
            password.text = "synthetic-test-value";
            verify(findChild(theme, "signIn").visible);
            keyClick(Qt.Key_Tab);
            verify(findChild(theme, "signIn").activeFocus);
            keyClick(Qt.Key_Tab);
            verify(session.activeFocus);
            keyClick(Qt.Key_Tab);
            verify(findChild(theme, "suspend").activeFocus);
            keyClick(Qt.Key_Tab);
            verify(findChild(theme, "reboot").activeFocus);
            keyClick(Qt.Key_Tab);
            verify(findChild(theme, "powerOff").activeFocus);
            keyClick(Qt.Key_Tab);
            verify(username.activeFocus);
            keyClick(Qt.Key_Tab);
            verify(password.activeFocus);
            keyClick(Qt.Key_Backtab, Qt.ShiftModifier);
            verify(username.activeFocus);
            keyClick(Qt.Key_Backtab, Qt.ShiftModifier);
            verify(findChild(theme, "powerOff").activeFocus);
        }
        function test_signInArrowSubmits() {
            password.text = "synthetic-test-value";
            var signIn = findChild(theme, "signIn");
            verify(signIn.visible);
            signIn.clicked();
            compare(sddm.loginCalls, 1);
            verify(sddm.submittedExpectedSecret);
        }
        function test_enterAndDuplicateSubmission() {
            password.text = "synthetic-test-value";
            keyClick(Qt.Key_Return);
            compare(sddm.loginCalls, 1);
            compare(sddm.submittedUser, "preview-user");
            compare(sddm.submittedSession, 0);
            verify(sddm.submittedExpectedSecret);
            verify(theme.busy);
            compare(password.text.length, 0);
            theme.submit();
            compare(sddm.loginCalls, 1);
            verify(!username.enabled);
            verify(!session.enabled);
        }
        function test_failureClearsAndRefocuses() {
            password.text = "synthetic-test-value";
            theme.submit();
            sddm.loginFailed();
            verify(!theme.busy);
            verify(theme.failure.length > 0);
            compare(password.text.length, 0);
            verify(password.activeFocus);
            // The failure reads inside the field until typing starts.
            var hint = findChild(theme, "passwordHint");
            compare(hint.text, theme.failure);
            verify(hint.visible);
            password.text = "x";
            compare(theme.failure, "");
        }
        function test_userChangeClearsPassword() {
            password.text = "synthetic-test-value";
            username.text = "other-preview-user";
            compare(password.text.length, 0);
        }
        function test_sessionDefaults() {
            sessionModel.lastIndex = 2;
            theme.chooseSession();
            compare(session.currentIndex, 2);
            sessionModel.lastIndex = 0;
            theme.chooseSession();
            compare(session.currentIndex, 0);
            userModel.lastUser = "";
            theme.chooseSession();
            compare(session.currentIndex, 1);
            username.text = "";
            theme.focusForm();
            verify(username.activeFocus);
        }
        function test_blankUsername() {
            username.text = "  ";
            theme.submit();
            compare(sddm.loginCalls, 0);
            verify(theme.notice.length > 0);
            verify(findChild(theme, "feedback").visible);
            verify(username.activeFocus);
        }
        function test_successKeepsDisabled() {
            theme.submit();
            sddm.loginSucceeded();
            verify(theme.busy);
            verify(!username.enabled);
        }
        function test_powerCancelAndConfirmMockOnly() {
            var reboot = findChild(theme, "reboot");
            var dialog = findChild(theme, "powerDialog");
            theme.requestPower("reboot", reboot);
            tryCompare(dialog, "opened", true);
            compare(sddm.rebootCalls, 0);
            verify(findChild(theme, "cancelPower").activeFocus);
            keyClick(Qt.Key_Escape);
            tryCompare(dialog, "opened", false);
            compare(sddm.rebootCalls, 0);
            verify(reboot.activeFocus);
            theme.requestPower("poweroff", findChild(theme, "powerOff"));
            tryCompare(dialog, "opened", true);
            compare(sddm.powerOffCalls, 0);
            findChild(theme, "confirmPower").clicked();
            compare(sddm.powerOffCalls, 1);
            compare(sddm.rebootCalls, 0);
        }
        function test_sessionKeyboard() {
            session.forceActiveFocus();
            keyClick(Qt.Key_Space);
            tryCompare(session.popup, "opened", true);
            // The list rises 8px above the chip, left edges aligned.
            tryCompare(session.popup, "y", session.y - 8 - session.popup.height);
            compare(session.popup.x, session.x);
            keyClick(Qt.Key_Down);
            keyClick(Qt.Key_Return);
            tryCompare(session.popup, "opened", false);
            compare(session.currentIndex, 1);
        }
        function test_noSession() {
            session.currentIndex = -1;
            theme.submit();
            compare(sddm.loginCalls, 0);
            verify(theme.notice.length > 0);
        }
        function test_busyBlocksPower() {
            theme.busy = true;
            theme.requestPower("reboot", findChild(theme, "reboot"));
            verify(!findChild(theme, "powerDialog").opened);
            compare(sddm.rebootCalls, 0);
        }
        function test_suspendUsesNativeMockWithoutConfirmation() {
            var suspend = findChild(theme, "suspend");
            verify(suspend !== null);
            verify(suspend.visible);
            suspend.forceActiveFocus();
            keyClick(Qt.Key_Return);
            compare(sddm.suspendCalls, 1);
            verify(!findChild(theme, "powerDialog").opened);
            compare(sddm.rebootCalls, 0);
            compare(sddm.powerOffCalls, 0);
            theme.busy = true;
            verify(!suspend.enabled);
        }
        function test_powerNavigationSkipsUnavailableActions() {
            sddm.canSuspend = false;
            session.forceActiveFocus();
            keyClick(Qt.Key_Tab);
            verify(findChild(theme, "reboot").activeFocus);
            keyClick(Qt.Key_Backtab, Qt.ShiftModifier);
            verify(session.activeFocus);
            sddm.canReboot = false;
            keyClick(Qt.Key_Tab);
            verify(findChild(theme, "powerOff").activeFocus);
            keyClick(Qt.Key_Backtab, Qt.ShiftModifier);
            verify(session.activeFocus);
            sddm.canPowerOff = false;
            keyClick(Qt.Key_Tab);
            verify(username.activeFocus);
            keyClick(Qt.Key_Backtab, Qt.ShiftModifier);
            verify(session.activeFocus);
            sddm.canSuspend = true;
            keyClick(Qt.Key_Tab);
            verify(findChild(theme, "suspend").activeFocus);
            keyClick(Qt.Key_Tab);
            verify(username.activeFocus);
        }
        function test_smallViewportFeedbackStaysOnScreen() {
            fixture.width = 800;
            fixture.height = 600;
            keyboard.capsLock = true;
            var feedback = findChild(theme, "feedback");
            verify(feedback.visible);
            compare(feedback.text, "Caps Lock");
            // Clear of the corner controls even at 800×600.
            verify(feedback.y + feedback.height <= session.y - 16);
            var clock = findChild(theme, "clock");
            verify(clock.y >= 16);
        }
        function test_powerConfirmRisesFromButtons() {
            var dialog = findChild(theme, "powerDialog");
            var row = findChild(theme, "powerRow");
            theme.requestPower("poweroff", findChild(theme, "powerOff"));
            tryCompare(dialog, "opened", true);
            tryCompare(dialog, "y", row.y - 8 - dialog.height);
            compare(dialog.x + dialog.width, theme.width - 24);
            verify(findChild(theme, "powerOff").open);
            dialog.close();
        }
        function saveCapture(name) {
            wait(100);
            // Window capture includes the modal overlay, unlike grabToImage.
            var image = grabImage(theme);
            compare(image.width, fixture.width);
            compare(image.height, fixture.height);
            image.save(fixture.captureDirectory + "/" + name + ".png");
        }
        function test_zCaptures() {
            if (!fixture.captureDirectory)
                skip("Use --capture-dir to save temporary UI captures.");
            tryCompare(findChild(theme, "wallpaper"), "status", Image.Ready);
            var sizes = [[800, 600], [1280, 720], [1920, 1080], [2560, 1440]];
            for (var i = 0; i < sizes.length; ++i) {
                fixture.width = sizes[i][0];
                fixture.height = sizes[i][1];
                var prefix = sizes[i][0] + "x" + sizes[i][1];
                theme.failure = "";
                theme.focusForm();
                saveCapture(prefix + "-login");
                password.text = "synthetic-test-value";
                saveCapture(prefix + "-typing");
                password.text = "";
                password.text = "synthetic-test-value";
                theme.submit();
                sddm.loginFailed();
                saveCapture(prefix + "-error");
                theme.requestPower("reboot", findChild(theme, "reboot"));
                tryCompare(findChild(theme, "powerDialog"), "opened", true);
                saveCapture(prefix + "-confirm");
                findChild(theme, "powerDialog").close();
                session.popup.open();
                tryCompare(session.popup, "opened", true);
                saveCapture(prefix + "-session");
                session.popup.close();
            }
        }
    }
}
