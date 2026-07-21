# The Board

A browse-first meme board: guests browse public memes; authenticated users upload, vote, and report; admins moderate.

## Language

### Meme Creator

**Meme Creator**:
The in-app tool that composes a flat static image from a base image plus text, then hands it to the standard upload pipeline. The backend cannot distinguish a created meme from a directly uploaded one.
_Avoid_: Editor, generator, remix tool

**Template**:
A reusable base image in the template library, distinct from a Meme: it has no votes and no feed presence. Any user may create one (opt-in when captioning a local image); it shares the meme lifecycle mechanics: owner deletion, admin removal, reporting, soft delete with undo.
_Avoid_: Base meme, blank, stock image
