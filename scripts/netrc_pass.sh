#!/bin/env bash
if [ "$#" -ne 5 ]; then
	echo "Wrong number of arguments"
	echo "Usage: $0 address login password protocol keyemail"
	exit
fi

NETRC="$HOME/.netrc"
if [ -f "$NETRC" ]; then
	echo "$NETRC already exists."
	rm -i $NETRC
fi

NETRCGPG="$HOME/.netrc.gpg"
DECRYPTED=""
if [ -f "$NETRCGPG" ]; then
	echo "$NETRCGPG already exists. Decrypting..."
	DECRYPTED=$(gpg --decrypt $NETRCGPG)
	echo -e "$DECRYPTED" > $NETRC
fi

echo -e "machine $1\nlogin $2\npassword $3\nprotocol $4\n" >> $NETRC
gpg -e -r $5 ~/.netrc
rm -i $NETRC
