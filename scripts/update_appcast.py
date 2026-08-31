#!/usr/bin/env python3

import argparse
import html
import os
import re
import tempfile
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.dom import Node, minidom


def parse_arguments():
    parser = argparse.ArgumentParser(description="Add a release to the Sparkle appcast")
    parser.add_argument("--appcast", type=Path, required=True)
    parser.add_argument("--changelog", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--build", type=int, required=True)
    parser.add_argument("--channel", choices=("stable", "beta"), required=True)
    parser.add_argument("--signature", required=True)
    parser.add_argument("--length", type=int, required=True)
    parser.add_argument("--max-betas", type=int, default=5)
    parser.add_argument("--date", help="RFC 2822 publication date (defaults to now)")
    return parser.parse_args()


def direct_children(element, tag_name):
    return [
        child
        for child in element.childNodes
        if child.nodeType == Node.ELEMENT_NODE and child.tagName == tag_name
    ]


def child_text(element, tag_name):
    children = direct_children(element, tag_name)
    if not children or children[0].firstChild is None:
        return ""
    return "".join(
        child.data for child in children[0].childNodes if child.nodeType == Node.TEXT_NODE
    ).strip()


def short_version(item):
    enclosures = direct_children(item, "enclosure")
    if not enclosures:
        return ""
    return enclosures[0].getAttribute("sparkle:shortVersionString")


def is_beta(item):
    return child_text(item, "sparkle:channel") == "beta"


def changelog_html(changelog, beta):
    parts = []
    list_open = False

    if beta:
        parts.append(
            '<p style="background:#fff3cd;border:1px solid #ffc107;'
            'border-radius:6px;padding:8px 12px;margin-bottom:12px;'
            'color:#856404;font-size:0.9em;">'
            "&#9888; <strong>Beta Release</strong> - This version may be unstable. "
            "Only install it if you want to test new features early.</p>"
        )

    for raw_line in changelog.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("### "):
            if list_open:
                parts.append("</ul>")
                list_open = False
            parts.append(f"<h3>{html.escape(line[4:])}</h3>")
        elif line.startswith("- "):
            if not list_open:
                parts.append("<ul>")
                list_open = True
            parts.append(f"<li>{html.escape(line[2:])}</li>")
        else:
            if list_open:
                parts.append("</ul>")
                list_open = False
            parts.append(f"<p>{html.escape(line)}</p>")

    if list_open:
        parts.append("</ul>")
    return "\n".join(parts)


def append_text_element(document, parent, tag_name, value):
    element = document.createElement(tag_name)
    element.appendChild(document.createTextNode(value))
    parent.appendChild(element)
    return element


def create_item(document, args, changelog):
    beta = args.channel == "beta"
    display_version = args.tag.removeprefix("v") if beta else args.version
    item = document.createElement("item")

    append_text_element(
        document,
        item,
        "title",
        f"Version {args.version} (Beta)" if beta else f"Version {args.version}",
    )
    if beta:
        append_text_element(document, item, "sparkle:channel", "beta")

    release_notes = changelog_html(changelog, beta)
    if release_notes:
        if "]]>" in release_notes:
            raise ValueError("Changelog cannot contain the CDATA terminator ']]>'")
        description = document.createElement("description")
        description.appendChild(document.createCDATASection(f"\n{release_notes}\n"))
        item.appendChild(description)

    append_text_element(
        document,
        item,
        "pubDate",
        args.date or format_datetime(datetime.now(timezone.utc)),
    )

    enclosure = document.createElement("enclosure")
    enclosure.setAttribute(
        "url",
        f"https://github.com/vordenken/AutoPiP/releases/download/{args.tag}/AutoPiP.dmg",
    )
    enclosure.setAttribute("sparkle:version", str(args.build))
    enclosure.setAttribute("sparkle:shortVersionString", display_version)
    enclosure.setAttribute("sparkle:edSignature", args.signature)
    enclosure.setAttribute("length", str(args.length))
    enclosure.setAttribute("type", "application/octet-stream")
    item.appendChild(enclosure)
    return item


def remove_whitespace_nodes(node):
    for child in list(node.childNodes):
        if child.nodeType == Node.TEXT_NODE and not child.data.strip():
            node.removeChild(child)
        elif child.hasChildNodes():
            remove_whitespace_nodes(child)


def validate_arguments(args):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", args.version):
        raise ValueError(f"Invalid version: {args.version}")
    expected_tag = rf"v{re.escape(args.version)}"
    if args.channel == "beta":
        expected_tag += r"-beta[0-9]+"
    if not re.fullmatch(expected_tag, args.tag):
        raise ValueError(f"Tag {args.tag} does not match {args.channel} version {args.version}")
    if args.build < 1 or args.length < 1 or args.max_betas < 1:
        raise ValueError("Build, length, and max-betas must be positive integers")


def update_appcast(args):
    validate_arguments(args)
    document = minidom.parse(str(args.appcast))
    channels = document.getElementsByTagName("channel")
    if len(channels) != 1:
        raise ValueError("Appcast must contain exactly one channel")
    channel = channels[0]
    changelog = args.changelog.read_text(encoding="utf-8")
    new_item = create_item(document, args, changelog)

    for item in list(direct_children(channel, "item")):
        item_version = short_version(item)
        duplicate = item_version == short_version(new_item)
        promoted_beta = args.channel == "stable" and item_version.startswith(
            f"{args.version}-beta"
        )
        if duplicate or promoted_beta:
            channel.removeChild(item)

    existing_items = direct_children(channel, "item")
    if existing_items:
        channel.insertBefore(new_item, existing_items[0])
    else:
        channel.appendChild(new_item)

    beta_items = [item for item in direct_children(channel, "item") if is_beta(item)]
    for expired_beta in beta_items[args.max_betas :]:
        channel.removeChild(expired_beta)

    remove_whitespace_nodes(document)
    output = document.toprettyxml(indent="    ", encoding="utf-8")
    with tempfile.NamedTemporaryFile(
        mode="wb", dir=args.appcast.parent, delete=False, prefix="appcast-"
    ) as temporary_file:
        temporary_file.write(output)
        temporary_path = Path(temporary_file.name)
    os.replace(temporary_path, args.appcast)


def main():
    args = parse_arguments()
    update_appcast(args)


if __name__ == "__main__":
    main()