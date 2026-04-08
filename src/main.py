import uvicorn


def run():
    print("前端访问地址: http://localhost:8000")
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000)


def dev():
    print("前端访问地址: http://localhost:8000")
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000, reload=True)
