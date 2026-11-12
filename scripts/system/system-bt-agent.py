#!/usr/bin/env python3
"""BlueZ pairing agent for the Quickshell bar.

Quickshell can start pairing but cannot answer BlueZ's questions during it,
so without an agent BlueZ rejects the pairing ("No agent available"). This
registers as the default agent with the NoInputNoOutput capability and answers
for the user, who started the pairing from the bar:

- passkey confirmation and pairing authorization are accepted;
- legacy PIN requests get 0000, the usual default for old headsets and mice;
- passkey entry is rejected, as nothing here can type a code;
- service authorization is accepted only for paired devices.

Incoming pairing from unknown devices never reaches this agent while the
adapter is not pairable, which is BlueZ's default.

It also unsticks headphones that connect without sound. When earbuds
(EarFun Air Pro 4) reconnect by themselves, they and BlueZ open A2DP at the
same time, BlueZ fails with "a2dp-sink profile connect failed: Device or
resource busy" and nothing retries: the device shows connected but plays
nothing. A disconnect then connect from this side always works, so when a
connected audio sink still has no A2DP transport after A2DP_GRACE_SECONDS,
this does exactly that, at most once per RECOVERY_COOLDOWN_SECONDS.

Runs in the foreground (leo-bt-agent.service) and registers again whenever
bluetoothd restarts. Logs go to stdout.
"""

import sys

from gi.repository import Gio, GLib

BUS_NAME = 'org.bluez'
AGENT_PATH = '/leo/bluetooth/agent'
CAPABILITY = 'NoInputNoOutput'
LEGACY_PIN = '0000'

INTROSPECTION = """
<node>
  <interface name="org.bluez.Agent1">
    <method name="Release"/>
    <method name="RequestPinCode">
      <arg type="o" direction="in"/><arg type="s" direction="out"/>
    </method>
    <method name="DisplayPinCode">
      <arg type="o" direction="in"/><arg type="s" direction="in"/>
    </method>
    <method name="RequestPasskey">
      <arg type="o" direction="in"/><arg type="u" direction="out"/>
    </method>
    <method name="DisplayPasskey">
      <arg type="o" direction="in"/><arg type="u" direction="in"/><arg type="q" direction="in"/>
    </method>
    <method name="RequestConfirmation">
      <arg type="o" direction="in"/><arg type="u" direction="in"/>
    </method>
    <method name="RequestAuthorization">
      <arg type="o" direction="in"/>
    </method>
    <method name="AuthorizeService">
      <arg type="o" direction="in"/><arg type="s" direction="in"/>
    </method>
    <method name="Cancel"/>
  </interface>
</node>
"""

A2DP_SINK = '0000110b-0000-1000-8000-00805f9b34fb'
A2DP_GRACE_SECONDS = 10
RECONNECT_DELAY_SECONDS = 2
RECOVERY_COOLDOWN_SECONDS = 60

ACCEPT = ('accept', None)
REJECT = ('reject', None)


def decide(method: str, paired: bool = False) -> tuple[str, object]:
    """Answer an Agent1 call: ('accept', return value) or ('reject', None)."""
    if method in ('RequestConfirmation', 'RequestAuthorization'):
        return ACCEPT
    if method == 'RequestPinCode':
        return ('accept', LEGACY_PIN)
    if method == 'AuthorizeService':
        return ACCEPT if paired else REJECT
    if method == 'RequestPasskey':
        return REJECT
    # Release, Cancel, DisplayPinCode, DisplayPasskey: nothing to answer.
    return ACCEPT


def log(message: str) -> None:
    print(message, flush=True)


def device_paired(bus: Gio.DBusConnection, device: str) -> bool:
    try:
        reply = bus.call_sync(BUS_NAME, device, 'org.freedesktop.DBus.Properties', 'Get',
                              GLib.Variant('(ss)', ('org.bluez.Device1', 'Paired')),
                              GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, -1, None)
    except GLib.Error as error:
        log(f'Cannot read Paired for {device}: {error.message}')
        return False
    return bool(reply.unpack()[0])


def on_call(bus, sender, path, interface, method, params, invocation):
    args = params.unpack()
    device = args[0] if args else ''
    paired = method == 'AuthorizeService' and device_paired(bus, device)
    verdict, value = decide(method, paired)
    log(f'{method} {" ".join(map(str, args))}: {verdict}')
    if verdict == 'reject':
        invocation.return_dbus_error('org.bluez.Error.Rejected', f'{method} rejected')
    elif value is None:
        invocation.return_value(None)
    elif isinstance(value, str):
        invocation.return_value(GLib.Variant('(s)', (value,)))
    else:
        invocation.return_value(GLib.Variant('(u)', (value,)))


def audio_stuck(device: str, objects: dict) -> bool:
    """True when a connected A2DP sink has no media transport under it."""
    props = objects.get(device, {}).get('org.bluez.Device1', {})
    if not props.get('Connected') or A2DP_SINK not in props.get('UUIDs', []):
        return False
    return not any(path.startswith(device + '/') and 'org.bluez.MediaTransport1' in ifaces
                   for path, ifaces in objects.items())


last_recovery: dict[str, float] = {}


def call_device(bus: Gio.DBusConnection, device: str, method: str) -> None:
    def done(_bus, result):
        try:
            bus.call_finish(result)
        except GLib.Error as error:
            log(f'{method} {device}: {error.message}')
    bus.call(BUS_NAME, device, 'org.bluez.Device1', method, None, None,
             Gio.DBusCallFlags.NONE, -1, None, done)


def check_audio(bus: Gio.DBusConnection, device: str) -> bool:
    try:
        reply = bus.call_sync(BUS_NAME, '/', 'org.freedesktop.DBus.ObjectManager',
                              'GetManagedObjects', None, None, Gio.DBusCallFlags.NONE, -1, None)
    except GLib.Error as error:
        log(f'Cannot list BlueZ objects: {error.message}')
        return GLib.SOURCE_REMOVE
    now = GLib.get_monotonic_time() / 1e6
    if not audio_stuck(device, reply.unpack()[0]):
        return GLib.SOURCE_REMOVE
    if now - last_recovery.get(device, -RECOVERY_COOLDOWN_SECONDS) < RECOVERY_COOLDOWN_SECONDS:
        log(f'{device} still has no A2DP stream, already reconnected recently')
        return GLib.SOURCE_REMOVE
    last_recovery[device] = now
    log(f'{device} connected without an A2DP stream, reconnecting')
    call_device(bus, device, 'Disconnect')
    GLib.timeout_add_seconds(RECONNECT_DELAY_SECONDS,
                             lambda: call_device(bus, device, 'Connect') or GLib.SOURCE_REMOVE)
    return GLib.SOURCE_REMOVE


def on_properties_changed(bus, _sender, path, _interface, _signal, params):
    interface, changed, _invalidated = params.unpack()
    if interface == 'org.bluez.Device1' and changed.get('Connected') is True:
        GLib.timeout_add_seconds(A2DP_GRACE_SECONDS, check_audio, bus, path)


def register(bus: Gio.DBusConnection, *_args) -> None:
    def call(method, params):
        bus.call_sync(BUS_NAME, '/org/bluez', 'org.bluez.AgentManager1', method, params,
                      None, Gio.DBusCallFlags.NONE, -1, None)
    try:
        call('RegisterAgent', GLib.Variant('(os)', (AGENT_PATH, CAPABILITY)))
        call('RequestDefaultAgent', GLib.Variant('(o)', (AGENT_PATH,)))
    except GLib.Error as error:
        log(f'Cannot register the agent: {error.message}')
        return
    log(f'Registered {AGENT_PATH} as the default agent ({CAPABILITY})')


def main() -> int:
    bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
    interface = Gio.DBusNodeInfo.new_for_xml(INTROSPECTION).interfaces[0]
    bus.register_object(AGENT_PATH, interface, on_call, None, None)
    bus.signal_subscribe(BUS_NAME, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
                         None, None, Gio.DBusSignalFlags.NONE, on_properties_changed)
    # Register now if bluetoothd runs, and again each time it restarts.
    Gio.bus_watch_name_on_connection(bus, BUS_NAME, Gio.BusNameWatcherFlags.NONE,
                                     register, lambda *_: log('bluetoothd went away'))
    # BlueZ drops the agent by itself when this process's bus connection closes.
    try:
        GLib.MainLoop().run()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
