# GDB
set print pretty on
set pagination off

# Dashboard
define layout-default
	dashboard -layout source stack
	dashboard source -style height 30
end

define layout-detailed
	dashboard -layout registers source stack variables
	dashboard source -style height 20
end

define layout-assembly
	dashboard -layout source assembly stack
	dashboard source -style height 20
end

layout-default

#set logging on
# Hack add path to needed libs for SDK 0.9.5
python
sys.path.append(os.getenv('HOME') + '/.local/lib/python3.7/site-packages')
sys.path.append('/usr/lib/python3.7/site-packages')
end
source ~/.scripts/gdb/svd-dump.py
svd_load STMicro STM32L4x6.svd

# ========== PYTHON SCRIPTS ==========
python
import gdb

def bigEndian16(val):
	return '{:04x}'.format(((int(val) & 0xFF00) >> 8) | ((int(val) & 0xFF) << 8))

class zPrintIpv6Addr(gdb.Command):
	def __init__(self):
		# This registers our class as "simple_command"
		super(zPrintIpv6Addr, self).__init__("z_print_ipv6_addr", gdb.COMMAND_DATA)

	def invoke(self, arg, from_tty):
		addr = gdb.parse_and_eval('{}'.format(arg))
		addr = addr.dereference()
		if 'struct in6_addr' in str(addr.type):
			addr = addr['in6_u']
			addr = addr['u6_addr16']
		elif 'struct sockaddr_in6' in str(addr.type):
			addr = addr['sin6_addr']
			addr = addr['in6_u']
			addr = addr['u6_addr16']
		elif 'struct sockaddr' in str(addr.type):
			addr = addr['data']
		else:
			print('Unknown type \'{}\''.format(addr.type))
			return
		addr_str = ''
		addr_size = int(addr.type.sizeof / addr[0].type.sizeof)
		for i in range(addr_size):
			addr_str += bigEndian16(addr[i])
			if i < addr_size - 1:
				addr_str += ':'
		print(addr_str)

# This registers our class to the gdb runtime at "source" time.
zPrintIpv6Addr()

end

# ========== END PYTHON SCRIPTS ==========

define zephyr_thread_print_state
	set $thread_state = ((struct k_thread *)$arg0)->base.thread_state
	if ($thread_state == 1)
		printf "Dummy (1)"
	end
	if ($thread_state == 2)
		printf "Pending (2)"
	end
	if ($thread_state == 4)
		printf "Prestart (4)"
	end
	if ($thread_state == 8)
		printf "Dead (8)"
	end
	if ($thread_state == 16)
		printf "Suspended (16)"
	end
	if ($thread_state == 64)
		printf "Queue (64)"
	end
end

define zephyr_thread_stack
	printf "Thread=%p\n", ((struct k_thread *)$arg0)
	printf "State="
	zephyr_thread_print_state $arg0
	printf "\n"
	printf "PC=%p\n", *(((struct k_thread *)$arg0)->callee_saved.psp + 20)
	l **(((struct k_thread *)$arg0)->callee_saved.psp + 20)
	printf "Stack Ptr=%p\n", ((struct k_thread *)$arg0)->callee_saved.psp
	printf "Stack Frame=%p\n", ((((struct k_thread *)$arg0)->callee_saved.psp) + 20)
	x/32xw ((((struct k_thread *)$arg0)->callee_saved.psp) + 20)
end

define zephyr_show_thread
    printf "State=%d; ", ((struct k_thread *)$arg0)->base.thread_state
    printf "Prio=%d; ", ((struct k_thread *)$arg0)->base.prio
    printf "Entry=%p; ", ((struct k_thread *)$arg0)->entry.pEntry
    printf "PC=%p; ", *(((struct k_thread *)$arg0)->callee_saved.psp + 20)
    printf "PSP=%p; ", ((struct k_thread *)$arg0)->callee_saved.psp + 32

    set $stack_start = ((struct k_thread *)$arg0)->stack_info.start
    set $stack_size = ((struct k_thread *)$arg0)->stack_info.size
    printf "Stack: %p <- %p (%u bytes)", $stack_start, $stack_start + $stack_size, $stack_size
end

define zephyr_list_threads
    set $current_thread = _kernel.threads
    set $idx = 0

    while ($current_thread != 0)
        printf "Thread %02d (%p) ", $idx, $current_thread

        zephyr_show_thread $current_thread

        if ($current_thread == _kernel->current)
            printf " <- RUNNING"
        end
        printf "\n"

        set $PC = *(((struct k_thread *)$current_thread)->callee_saved.psp + 20)
        printf "\t"
        info line *$PC

        set $idx = $idx + 1
        set $current_thread = $current_thread->next_thread
    end
end

define zephyr_show_pkt
	printf "pkt=%p; ", ((struct net_pkt *)$arg0)
	printf "ref=%d; ", ((struct net_pkt *)$arg0)->ref
end

define zephyr_show_pkt_alloc
	printf "is_pkt=%d; ", ((struct net_pkt_alloc *)$arg0)->is_pkt
	printf "is_used=%d; ", ((struct net_pkt_alloc *)$arg0)->in_use
	printf "alloc=%s:%d; ", ((struct net_pkt_alloc *)$arg0)->func_alloc, ((struct net_pkt_alloc *)$arg0)->line_alloc
	printf "free=%s:%d; ", ((struct net_pkt_alloc *)$arg0)->func_free, ((struct net_pkt_alloc *)$arg0)->line_free
end

define zephyr_list_pkt
	set $idx = 0

	while ($idx < $arg0)
		printf "Packet %d: ", $idx
		zephyr_show_pkt_alloc &net_pkt_allocs[$idx]
		printf "\n\t"
		zephyr_show_pkt &(net_pkt_allocs[$idx]->pkt)
		printf "\n"
		set $idx = $idx + 1
	end
end
