#!/bin/env bash
NETRC="$HOME/.netrc"
NETRCGPG="$HOME/.netrc.gpg"

function print_help {
	echo "Usage: $0 [OPTION]"
    echo "  Options:"
    echo "  -a/--add address login password email   Add new password"
    echo "  -d/--decrypt                            Decrypt netrc file"
    echo "  -o/--overwrite                          Overwrite netrc.gpg file"
}

function decrypt {
    DECRYPTED=""
    if [ -f "$NETRC" ]; then
	    echo "$NETRC already exists."
        exit
    fi

    if [ ! -f "$NETRCGPG" ]; then
        echo "$NETRCGPG does not exist"
        exit
    fi

    echo "Decrypting $NETRCGPG..."
	DECRYPTED=$(gpg --decrypt $NETRCGPG)
	echo -e "$DECRYPTED" > $NETRC
}

ADD=0
DECRYPT=0
OVERWRITE=0
while [[ $# -gt 0 ]]; do
  case $1 in
    -a|--add)
    ADD=1
    shift # past argument
    ADDRESS="$1"
    shift # past argument
    LOGIN="$1"
    shift # past argument
    PASSWD="$1"
    shift # past argument
    EMAIL="$1"
    shift # past argument
    ;;
    -d|--decrypt)
    DECRYPT=1
    shift # past argument
    ;;
    -o|--overwrite)
    OVERWRITE=1
    shift # past argument
    ;;
    -h|--help)
    print_help
    exit 1
    ;;
    -*|--*)
    echo "Unknown option $1"
    exit 1
    ;;
  esac
done

DECRYPTED=""
if [ "$DECRYPT" = 1 ]; then
    decrypt
fi

if [ "$ADD" = 1 ]; then
    if [ "$ADDRESS" = "" ] || [ "$LOGIN" = "" ] || [ "$PASSWD" = "" ] || [ "$EMAIL" = "" ]; then
        echo "Bad parameters for add"
        print_help
        exit 0
    fi

    echo "Add new password"
    echo "$ADDRESS $LOGIN $EMAIL"

    if [ "$OVERWRITE" = 0 ] && [ -f "$NETRCGPG" ]; then
        decrypt
    fi

    echo -e "machine $ADDRESS\nlogin $LOGIN\npassword $PASSWD\nprotocol https\n" >> $NETRC
    gpg -e -r $EMAIL ~/.netrc
    rm -i $NETRC
fi
